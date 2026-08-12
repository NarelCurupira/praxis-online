import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const offlineStore = readFileSync(new URL("./offlineStore.ts", import.meta.url), "utf8");
const offlineSync = readFileSync(new URL("./offlineSync.ts", import.meta.url), "utf8");
const queuePanel = readFileSync(new URL("./components/OfflineQueuePanel.tsx", import.meta.url), "utf8");
const processTable = readFileSync(new URL("./components/ProcessTable.tsx", import.meta.url), "utf8");
const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

test("contingência mantém snapshot isolado por usuário e Procuradoria", () => {
  assert.match(offlineStore, /indexedDB\.open/);
  assert.match(offlineStore, /`\$\{userId\}:\$\{workspaceId\}`/);
  assert.match(offlineStore, /3 \* 24 \* 60 \* 60 \* 1000/);
});

test("IndexedDB v2 possui fila de sincronização isolada", () => {
  assert.match(offlineStore, /const DB_VERSION = 2/);
  assert.match(offlineStore, /const SYNC_QUEUE = "sync_queue"/);
  assert.match(offlineStore, /store\.createIndex\("userId"/);
  assert.match(offlineStore, /store\.createIndex\("workspaceId"/);
});

test("snapshot continua removendo campos detalhados e documentos", () => {
  assert.match(offlineStore, /notes: ""/);
  assert.match(offlineStore, /documentPath: ""/);
  assert.match(offlineStore, /relevanceReason: ""/);
  assert.match(offlineStore, /complexityReason: ""/);
});

test("0.11.1-RC permite gravação operacional local mas mantém ações sensíveis bloqueadas", () => {
  assert.match(app, /Modo contingência · gravação local/);
  assert.match(app, /new Set<Page>\(\["dashboard", "queue", "processes"\]\)/);
  assert.doesNotMatch(app, /canCreateProcess: false/);
  assert.doesNotMatch(app, /canEditWorkflow: false/);
  assert.match(app, /canDelete: false/);
  assert.match(app, /canExport: false/);
  assert.match(app, /canTransferProcess: false/);
  assert.match(app, /canManageSettings: false/);
  assert.match(app, /canImport: false/);
});

test("operações locais suportam cadastro, edição, status, providência e responsável", () => {
  assert.match(offlineStore, /"create" \| "edit" \| "status" \| "action" \| "assignment"/);
  assert.match(app, /enqueueOfflineOperation/);
  assert.match(app, /enqueueOfflineOperations/);
  assert.match(processTable, /local-pending/);
});

test("falha transitória de escrita muda para fila local sem contornar erro de validação", () => {
  assert.match(app, /function isTransientWriteFailure/);
  assert.match(app, /if \(!isTransientWriteFailure\(error\)\) throw error/);
  assert.match(app, /activateWriteContingency\(error\)/);
});

test("sincronização reutiliza as mesmas APIs protegidas pelo servidor", () => {
  assert.match(offlineSync, /findMovementForOfflineCreate/);
  assert.match(offlineSync, /createMovement\(operation\.payload\.data\)/);
  assert.match(offlineSync, /updateMovementGoverned/);
  assert.match(offlineSync, /updateMovementStatus/);
  assert.match(offlineSync, /updateMovementAction/);
  assert.match(offlineSync, /updateMovementAssignment/);
  assert.match(offlineSync, /getMovementOfflineSyncState/);
  assert.match(offlineSync, /break; \/\/ Preserva a ordem/);
});

test("horário local de envio em contingência é preservado na sincronização", () => {
  assert.match(offlineSync, /updateMovementStatus\(movementId, operation\.payload\.status, operation\.payload\.actionType, operation\.createdAt\)/);
  assert.match(api, /occurredAt\?: string/);
  assert.match(api, /occurredAt \?\? new Date\(\)\.toISOString\(\)/);
});

test("fila mostra falhas, permite nova tentativa e explicita limite da RC", () => {
  assert.match(queuePanel, /Fila de sincronização/);
  assert.match(queuePanel, /Sincronizar esta Procuradoria/);
  assert.match(queuePanel, /Detecção e resolução de alterações concorrentes serão incorporadas na versão 1\.0/);
  assert.match(queuePanel, /window\.confirm/);
});

test("logout alerta antes de apagar fila e depois limpa dados locais", () => {
  assert.match(app, /Sair agora apagará essa fila deste dispositivo/);
  assert.match(app, /clearOfflineUserData\(session\.user\.id\)/);
  assert.match(offlineStore, /db\.transaction\(\[SNAPSHOTS, META, SYNC_QUEUE\]/);
});

test("service worker continua devolvendo o shell em navegação offline", () => {
  assert.match(sw, /cache\.match\("\/"\)/);
  assert.match(sw, /cache\.match\("\/index\.html"\)/);
});
