import type { RealtimeChannel } from "@supabase/supabase-js";
import { requireSupabase } from "./supabase";

export const WEB_PUSH_PUBLIC_KEY = "BKJOEfUPTeEOcLFd1tXsRw2rvgyZEZa54pz-LaISOc-PHJooa1spIlqQiWboSASg1uFuYViUnPcm3QU6znSKc68";

export type NotificationType = "assignment" | "transfer" | "status" | "deadline" | "system";
export type NotificationSeverity = "info" | "success" | "warning" | "urgent";

export interface PraxisNotification {
  id: string;
  recipientUserId: string;
  workspaceId: string;
  workspaceName: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  movementId: number | null;
  processNumber: string;
  actorUserId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  pushAssignments: boolean;
  pushTransfers: boolean;
  pushStatus: boolean;
  pushDeadlines: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  pushAssignments: true,
  pushTransfers: true,
  pushStatus: false,
  pushDeadlines: false,
};

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function mapNotification(row: Record<string, unknown>): PraxisNotification {
  return {
    id: String(row.id),
    recipientUserId: String(row.recipient_user_id),
    workspaceId: String(row.workspace_id),
    workspaceName: String(row.workspace_name ?? "Procuradoria"),
    type: String(row.notification_type ?? "system") as NotificationType,
    severity: String(row.severity ?? "info") as NotificationSeverity,
    title: String(row.title ?? "Práxis"),
    body: String(row.body ?? ""),
    movementId: row.movement_id == null ? null : Number(row.movement_id),
    processNumber: String(row.process_number ?? ""),
    actorUserId: row.actor_user_id == null ? null : String(row.actor_user_id),
    readAt: row.read_at == null ? null : String(row.read_at),
    createdAt: String(row.created_at),
  };
}

export async function listNotifications(limit = 80): Promise<PraxisNotification[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("user_notifications")
    .select("id,recipient_user_id,workspace_id,workspace_name,notification_type,severity,title,body,movement_id,process_number,actor_user_id,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));
  fail(error);
  return (data ?? []).map((row) => mapNotification(row as Record<string, unknown>));
}

export async function getNotification(notificationId: string): Promise<PraxisNotification | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("user_notifications")
    .select("id,recipient_user_id,workspace_id,workspace_name,notification_type,severity,title,body,movement_id,process_number,actor_user_id,read_at,created_at")
    .eq("id", notificationId).maybeSingle();
  fail(error);
  return data ? mapNotification(data as Record<string, unknown>) : null;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("mark_notification_read_v0113", { target_notification: notificationId });
  fail(error);
}

export async function markAllNotificationsRead(): Promise<number> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("mark_all_notifications_read_v0113");
  fail(error);
  return Number(data ?? 0);
}

export function subscribeNotifications(userId: string, onInsert: (item: PraxisNotification) => void): RealtimeChannel {
  const client = requireSupabase();
  const channel = client.channel(`praxis-notifications:${userId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "user_notifications",
      filter: `recipient_user_id=eq.${userId}`,
    }, (payload) => onInsert(mapNotification(payload.new as Record<string, unknown>)))
    .subscribe();
  return channel;
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_notification_preferences_v0113");
  fail(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return DEFAULT_PREFERENCES;
  return {
    pushEnabled: Boolean(row.push_enabled),
    pushAssignments: Boolean(row.push_assignments),
    pushTransfers: Boolean(row.push_transfers),
    pushStatus: Boolean(row.push_status),
    pushDeadlines: Boolean(row.push_deadlines),
  };
}

export async function saveNotificationPreferences(value: NotificationPreferences): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("save_notification_preferences_v0113", {
    new_push_enabled: value.pushEnabled,
    new_push_assignments: value.pushAssignments,
    new_push_transfers: value.pushTransfers,
    new_push_status: value.pushStatus,
    new_push_deadlines: value.pushDeadlines,
  });
  fail(error);
}

export function supportsWebPush(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export async function registerCurrentPushSubscription(): Promise<PushSubscription> {
  if (!supportsWebPush()) throw new Error("Este navegador não oferece suporte a notificações Push.");
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("A permissão de notificações não foi concedida.");

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
    });
  }
  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
    throw new Error("O navegador não retornou uma assinatura Push completa.");
  }

  const client = requireSupabase();
  const { error } = await client.rpc("upsert_push_subscription_v0113", {
    subscription_endpoint: serialized.endpoint,
    subscription_p256dh: serialized.keys.p256dh,
    subscription_auth: serialized.keys.auth,
    subscription_user_agent: navigator.userAgent,
  });
  fail(error);
  await pokePushDelivery().catch(() => undefined);
  return subscription;
}

export async function unregisterCurrentPushSubscription(): Promise<void> {
  if (!supportsWebPush()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const client = requireSupabase();
  const { error } = await client.rpc("remove_push_subscription_v0113", {
    subscription_endpoint: subscription.endpoint,
  });
  fail(error);
  await subscription.unsubscribe();
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!supportsWebPush()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function countRegisteredPushDevices(): Promise<number> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("count_my_push_subscriptions_v0113");
  fail(error);
  return Number(data ?? 0);
}

export async function pokePushDelivery(): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.functions.invoke("push-dispatch", { body: { limit: 50 } });
  if (error) throw new Error(error.message);
}
