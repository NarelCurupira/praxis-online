import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DeliveryRow = {
  delivery_id: number;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  notification_id: string;
  recipient_user_id: string;
  workspace_id: string;
  movement_id: number | null;
  notification_type: string;
  severity: string;
  title: string;
  body: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : null;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "body" in error) return String((error as { body: unknown }).body ?? "Falha Web Push");
  return String(error ?? "Falha Web Push");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublic = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") || "mailto:admin@praxis.local";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Configuração Supabase incompleta.");
    if (!vapidPublic || !vapidPrivate) throw new Error("Chaves VAPID não configuradas.");

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await request.json().catch(() => ({})) as { dispatch_token?: string; limit?: number };
    const requestedLimit = Math.max(1, Math.min(Number(body.limit) || 50, 100));
    let targetUser: string | null = null;

    if (body.dispatch_token) {
      const { data: runtime, error: runtimeError } = await admin.from("push_runtime_v0113")
        .select("dispatch_token").eq("singleton", true).maybeSingle();
      if (runtimeError) throw runtimeError;
      if (!runtime?.dispatch_token || runtime.dispatch_token !== body.dispatch_token) {
        return json({ error: "Disparo não autorizado." }, 401);
      }
    } else {
      const authorization = request.headers.get("Authorization");
      if (!authorization) return json({ error: "Sessão não informada." }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data.user) return json({ error: "Sessão inválida ou expirada." }, 401);
      targetUser = data.user.id;
    }

    const { data, error: claimError } = await admin.rpc("claim_push_deliveries_v0113", {
      target_user: targetUser,
      batch_limit: requestedLimit,
    });
    if (claimError) throw claimError;

    const deliveries = (data ?? []) as DeliveryRow[];
    let sent = 0;
    let failed = 0;

    for (const delivery of deliveries) {
      try {
        const payload = JSON.stringify({
          notificationId: delivery.notification_id,
          workspaceId: delivery.workspace_id,
          movementId: delivery.movement_id,
          type: delivery.notification_type,
          severity: delivery.severity,
          title: delivery.title,
          body: delivery.body,
          url: delivery.movement_id
            ? `/?notification=${encodeURIComponent(delivery.notification_id)}&workspace=${encodeURIComponent(delivery.workspace_id)}&movement=${encodeURIComponent(String(delivery.movement_id))}`
            : `/?notification=${encodeURIComponent(delivery.notification_id)}`,
        });

        await webpush.sendNotification({
          endpoint: delivery.endpoint,
          keys: { p256dh: delivery.p256dh, auth: delivery.auth_secret },
        }, payload, {
          TTL: 60 * 60 * 12,
          urgency: delivery.severity === "urgent" ? "high" : "normal",
        });

        const { error: completeError } = await admin.rpc("complete_push_delivery_v0113", {
          target_delivery: delivery.delivery_id,
          succeeded: true,
          permanent_failure: false,
          error_message: "",
        });
        if (completeError) throw completeError;
        sent += 1;
      } catch (pushError) {
        const code = statusCode(pushError);
        const permanent = code === 404 || code === 410;
        const message = errorText(pushError).slice(0, 1000);
        await admin.rpc("complete_push_delivery_v0113", {
          target_delivery: delivery.delivery_id,
          succeeded: false,
          permanent_failure: permanent,
          error_message: message,
        });
        failed += 1;
      }
    }

    return json({ ok: true, claimed: deliveries.length, sent, failed });
  } catch (error) {
    return json({ error: errorText(error) }, 500);
  }
});
