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
    const targetUserId = String(body.targetUserId ?? "");
    const { data: membership, error: membershipError } = await adminClient.from("workspace_members")
      .select("user_id").eq("workspace_id", profile.current_workspace_id).eq("user_id", targetUserId).maybeSingle();
    if (membershipError || !membership) throw new Error("Usuário não pertence a este espaço");

    if (body.action !== "update_email") throw new Error("Ação administrativa desconhecida");
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
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  }
});

