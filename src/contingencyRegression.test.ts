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

test("IndexedDB mantém fila de sincronização isolada", () => {
  assert.match(offlineStore, /const DB_VERSION = 2/);
  assert.match(offlineStore, /const SYNC_QUEUE = "sync_queue"/);
  assert.match(offlineStore, /store\.createIndex\("userId"/);
  assert.match(offlineStore, /store\.createIndex\("workspaceId"/);
});

test("snapshot continua removendo campos detalhados e neutraliza MFA persistente", () => {
  assert.match(offlineStore, /notes: ""/);
  assert.match(offlineStore, /documentPath: ""/);
  assert.match(offlineStore, /relevanceReason: ""/);
  assert.match(offlineStore, /complexityReason: ""/);
  assert.match(offlineStore, /mfaRequired: false/);
  assert.match(offlineStore, /offlineSafeSnapshot/);
});

test("0.11.2-RC permite gravação operacional local mas mantém ações sensíveis bloqueadas", () => {
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

test("cada alteração existente guarda base para detecção de concorrência", () => {
  assert.match(offlineStore, /OfflineOperationBaseline/);
  assert.match(offlineStore, /baseline: OfflineOperationBaseline \| null/);
  assert.match(app, /createOfflineBaseline\(record, payload\)/);
  assert.match(app, /offlineMutationInput/);
});

test("detecção usa three-way merge por campo e ignora convergência", () => {
  assert.match(offlineSync, /Three-way merge/);
  assert.match(offlineSync, /current !== before && current !== desired/);
  assert.match(offlineSync, /detectOfflineConflict/);
  assert.match(offlineSync, /fieldsForPayload/);
});

test("operações herdadas da 0.11.1-RC sem baseline exigem decisão, salvo dependentes de cadastro local", () => {
  assert.match(offlineSync, /kind: "baseline_unavailable"/);
  assert.match(offlineSync, /originatedFromLocalCreate/);
  assert.match(offlineSync, /!operation\.baseline && originatedFromLocalCreate/);
});

test("arquivamento, exclusão ou desaparecimento do servidor não podem ser sobrescritos localmente", () => {
  assert.match(offlineSync, /kind: "record_unavailable"/);
  assert.match(offlineSync, /kind: "lifecycle_change"/);
  assert.match(offlineSync, /canApplyLocal: false/);
});

test("conflito pausa a fila e fica persistido para decisão explícita", () => {
  assert.match(offlineStore, /markOfflineOperationConflict/);
  assert.match(offlineSync, /await markOfflineOperationConflict\(operation\.id, conflict\)/);
  assert.match(offlineSync, /Há um conflito pendente de resolução/);
  assert.match(offlineSync, /break;/);
});

test("fila oferece manter servidor ou aplicar alteração local", () => {
  assert.match(queuePanel, /Manter servidor/);
  assert.match(queuePanel, /Aplicar alteração local/);
  assert.match(queuePanel, /Resolva o conflito para continuar/);
  assert.match(queuePanel, /0\.11\.2-RC/);
  assert.match(app, /resolveOfflineOperationConflict\(session\.user\.id, operationId, "local_wins"\)/);
});

test("resolução local volta pela mesma API protegida e não contorna RLS", () => {
  assert.match(offlineSync, /getMovementForOfflineSync/);
  assert.match(offlineSync, /applyMovementOperation/);
  assert.match(offlineSync, /baseline: current, userId, workspaceId/);
});

test("sincronização permanece idempotente quando servidor já contém o alvo local", () => {
  assert.match(offlineSync, /operationAlreadyApplied/);
  assert.match(offlineSync, /applyMovementOperation/);
  assert.match(offlineSync, /operationId: operation.id/);
});

test("falha transitória de escrita muda para fila local sem contornar erro de validação", () => {
  assert.match(app, /function isTransientWriteFailure/);
  assert.match(app, /if \(!isTransientWriteFailure\(error\)\) throw error/);
  assert.match(app, /activateWriteContingency\(error\)/);
});

test("horário local de envio em contingência é preservado na sincronização", () => {
  assert.match(offlineSync, /occurredAt: operation.createdAt/);
  assert.match(api, /occurredAt\?: string/);
  assert.match(api, /occurredAt \?\? new Date\(\)\.toISOString\(\)/);
});

test("logout alerta antes de apagar fila e depois limpa dados locais", () => {
  assert.match(app, /Sair agora apagará essa fila deste dispositivo/);
  assert.match(app, /clearOfflineUserData\(session\.user\.id\)/);
  assert.match(offlineStore, /db\.transaction\(\[SNAPSHOTS, META, SYNC_QUEUE\]/);
});

test("service worker continua devolvendo o shell em navegação offline", () => {
  assert.match(sw, /const cachedShell = await cache\.match\("\/"\)/);
  assert.match(sw, /if \(cachedShell\) return cleanResponse\(cachedShell\)/);
  assert.doesNotMatch(sw, /request\.mode === "navigate" \? "\/index\.html"/);
});
