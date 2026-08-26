import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const store = readFileSync(new URL("./offlineStore.ts", import.meta.url), "utf8");
const sync = readFileSync(new URL("./offlineSync.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("./notificationApi.ts", import.meta.url), "utf8");
const center = readFileSync(new URL("./components/InformationCenter.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("./components/PushSettingsPanel.tsx", import.meta.url), "utf8");
const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260825_praxis_v0113_push_central.sql", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/push-dispatch/index.ts", import.meta.url), "utf8");

test("Push e Central não entram na fila de contingência", () => {
  assert.equal(store.includes("notificationApi"), false);
  assert.equal(sync.includes("notificationApi"), false);
  assert.equal(sync.includes("push_"), false);
});

test("Central está no shell global e respeita contingência", () => {
  assert.match(app, /<InformationCenter/);
  assert.match(app, /online=\{online && !contingencyMode\}/);
  assert.match(center, /não altera nem substitui dados da contingência/);
});

test("clique de notificação consegue focar um movimento", () => {
  assert.match(app, /kind: "movement"/);
  assert.match(app, /notification\.workspaceId/);
});

test("Web Push usa chave pública no cliente e segredo somente na Edge Function", () => {
  assert.match(api, /WEB_PUSH_PUBLIC_KEY/);
  assert.equal(api.includes("WEB_PUSH_VAPID_PRIVATE_KEY"), false);
  assert.match(edge, /WEB_PUSH_VAPID_PRIVATE_KEY/);
});

test("Service Worker recebe Push e trata clique", () => {
  assert.match(sw, /addEventListener\("push"/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /addEventListener\("notificationclick"/);
});

test("Central possui RLS por destinatário", () => {
  assert.match(migration, /recipient_user_id = auth\.uid\(\)/);
  assert.match(migration, /alter table public\.user_notifications enable row level security/);
});

test("fila Push é própria e recupera entregas processing abandonadas", () => {
  assert.match(migration, /create table if not exists public\.push_deliveries/);
  assert.match(migration, /skip locked/i);
  assert.match(migration, /interval '10 minutes'/);
});

test("atribuição e transferência são Push padrão; status e prazo são preferências", () => {
  assert.match(migration, /target_type in \('assignment','transfer'\)/);
  assert.match(settings, /pushStatus/);
  assert.match(settings, /pushDeadlines/);
  assert.match(migration, /notification_push_allowed_v0113/);
});

test("falha da Central ou do transporte Push não aborta operação processual", () => {
  assert.match(migration, /Central\/Push são subsistemas auxiliares/);
  assert.match(migration, /Falha de entrega Push nunca pode abortar/);
  const exceptions = migration.match(/exception when others then[\s\S]*?return new;/gi) ?? [];
  assert.ok(exceptions.length >= 2);
});
