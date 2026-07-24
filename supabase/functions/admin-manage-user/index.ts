import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Sessão não informada");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) throw new Error("Sessão inválida ou expirada");
    const { data: profile, error: profileError } = await userClient.from("profiles")
      .select("current_workspace_id").eq("id", userData.user.id).single();
    if (profileError || !profile?.current_workspace_id) throw new Error("Espaço de trabalho não encontrado");
    const { data: allowed, error: allowedError } = await userClient.rpc("is_workspace_admin", {
      target_workspace: profile.current_workspace_id,
    });
    if (allowedError || !allowed) throw new Error("Acesso administrativo e segundo fator necessários");

    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "create_member") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.fullName ?? "").trim();
      const role = String(body.role ?? "");
      const delivery = body.delivery === "email" ? "email" : "link";
      const historicalCoverageSince = body.historicalCoverageSince
        ? String(body.historicalCoverageSince)
        : null;
      const requestedRedirect = String(body.redirectTo ?? "").trim();
      const configuredSite = Deno.env.get("PUBLIC_SITE_URL")?.trim() ?? "";
      const redirectTo = configuredSite || requestedRedirect;

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido");
      if (!fullName) throw new Error("Informe o nome do usuário");
      if (!["procurador", "assessor", "consulta"].includes(role)) throw new Error("Perfil inválido");
      if (historicalCoverageSince && !/^\d{4}-\d{2}-\d{2}$/.test(historicalCoverageSince)) {
        throw new Error("Data de cobertura histórica inválida");
      }
      if (!redirectTo || !/^https?:\/\//.test(redirectTo)) throw new Error("Endereço de retorno inválido");

      let createdUser;
      let actionLink: string | null = null;
      if (delivery === "email") {
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName, must_set_password: true },
          redirectTo,
        });
        if (error) throw error;
        createdUser = data.user;
      } else {
        const { data, error } = await adminClient.auth.admin.generateLink({
          type: "invite",
          email,
          options: {
            data: { full_name: fullName, must_set_password: true },
            redirectTo,
          },
        });
        if (error) throw error;
        createdUser = data.user;
        actionLink = data.properties?.action_link ?? null;
      }
      if (!createdUser?.id) throw new Error("O Supabase não retornou a conta criada");

      const { error: profileUpsertError } = await adminClient.from("profiles").upsert({
        id: createdUser.id,
        full_name: fullName,
        current_workspace_id: profile.current_workspace_id,
      });
      if (profileUpsertError) throw profileUpsertError;
      const { error: memberUpsertError } = await adminClient.from("workspace_members").upsert({
        workspace_id: profile.current_workspace_id,
        user_id: createdUser.id,
        role,
        active: true,
        mfa_required: false,
        historico_disponivel_desde: historicalCoverageSince,
      }, { onConflict: "workspace_id,user_id" });
      if (memberUpsertError) throw memberUpsertError;
      await adminClient.from("admin_audit_log").insert({
        workspace_id: profile.current_workspace_id,
        actor_id: userData.user.id,
        event_type: "member_created_by_admin",
        details: {
          target_user: createdUser.id,
          delivery,
          role,
          historico_disponivel_desde: historicalCoverageSince,
        },
      });
      return new Response(JSON.stringify({
        ok: true,
        link: actionLink,
        emailSent: delivery === "email",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    if (action === "update_email") {
      const targetUserId = String(body.targetUserId ?? "");
      const { data: membership, error: membershipError } = await adminClient.from("workspace_members")
        .select("user_id").eq("workspace_id", profile.current_workspace_id).eq("user_id", targetUserId).maybeSingle();
      if (membershipError || !membership) throw new Error("Usuário não pertence a este espaço");
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inválido");
      const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, { email });
      if (updateError) throw updateError;
      await adminClient.from("admin_audit_log").insert({
        workspace_id: profile.current_workspace_id,
        actor_id: userData.user.id,
        event_type: "member_email_updated",
        details: { target_user: targetUserId },
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    throw new Error("Ação administrativa desconhecida");
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  }
});
