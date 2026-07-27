import assert from "node:assert/strict";
import test from "node:test";
import { buildImportPreview, DEFAULT_IMPORT_RULES } from "./intelligentImportApi";
import type { ImportRecord, ProcessMovement } from "./types";

function imported(overrides: Partial<ImportRecord> = {}): ImportRecord {
  return {
    mpNumber: "08.2026.00000001-0",
    judicialNumber: "0800001-00.2026.8.14.0000",
    className: "Apelação Cível",
    subject: "Teste",
    receivedAt: "2026-07-27T09:00:00-03:00",
    receivedTimePrecise: true,
    deadlineAt: "2026-09-07",
    actionType: "Manifestação",
    notes: "",
    priority: "Normal",
    documentPath: "",
    sociallyRelevant: false,
    extremelyComplex: false,
    socialTheme: "",
    relevanceReason: "",
    fundamentalRight: "",
    affectedGroup: "",
    reach: "",
    territorialScope: "",
    impactType: "",
    socialResult: "",
    sdgs: [],
    complexityReason: "",
    draftStatus: "Pendente",
    workflowStatus: "Recebido",
    sentAt: null,
    sentTimePrecise: false,
    ...overrides,
  };
}

function existing(overrides: Partial<ProcessMovement> = {}): ProcessMovement {
  return {
    movementId: 1,
    caseId: 1,
    mpNumber: "08.2026.00000001-0",
    judicialNumber: "0800001-00.2026.8.14.0000",
    className: "Apelação Cível",
    subject: "Teste",
    receivedAt: "2026-07-27T12:00:00.000Z",
    receivedTimePrecise: true,
    deadlineAt: "2026-09-07",
    draftStatus: "Pendente",
    workflowStatus: "Recebido",
    sentAt: null,
    sentTimePrecise: false,
    actionType: "Manifestação",
    notes: "",
    priority: "Normal",
    documentPath: "",
    elapsedHours: null,
    sociallyRelevant: false,
    extremelyComplex: false,
    socialTheme: "",
    relevanceReason: "",
    fundamentalRight: "",
    affectedGroup: "",
    reach: "",
    territorialScope: "",
    impactType: "",
    socialResult: "",
    sdgs: [],
    complexityReason: "",
    deletedAt: null,
    assignedTo: "user-1",
    assignedName: "Usuário",
    ...overrides,
  };
}

test("identifica processo novo", () => {
  const preview = buildImportPreview([imported()], [], DEFAULT_IMPORT_RULES);
  assert.equal(preview.newCases, 1);
  assert.equal(preview.accepted, 1);
});

test("não duplica linha repetida da mesma planilha", () => {
  const record = imported();
  const preview = buildImportPreview([record, { ...record }], [], DEFAULT_IMPORT_RULES);
  assert.equal(preview.duplicates, 1);
  assert.equal(preview.accepted, 1);
});

test("preserva conflito entre horários confirmados por padrão", () => {
  const preview = buildImportPreview([imported({ receivedAt: "2026-07-27T10:00:00-03:00" })], [existing()], DEFAULT_IMPORT_RULES);
  assert.equal(preview.conflicts, 1);
  assert.equal(preview.accepted, 0);
});

test("preenche horário quando o registro antigo possui apenas data", () => {
  const preview = buildImportPreview([imported()], [existing({ receivedTimePrecise: false, receivedAt: "2026-07-27T03:00:00.000Z" })], DEFAULT_IMPORT_RULES);
  assert.equal(preview.updates, 1);
  assert.equal(preview.accepted, 1);
});

test("validação rigorosa bloqueia todo o lote quando existe item inválido", () => {
  const rules = { ...DEFAULT_IMPORT_RULES, validationMode: "strict" as const };
  const preview = buildImportPreview([imported(), imported({ judicialNumber: "" })], [], rules);
  assert.equal(preview.invalid, 1);
  assert.equal(preview.accepted, 0);
});

test("mudança de status na mesma entrada atualiza a movimentação existente", () => {
  const rules = { ...DEFAULT_IMPORT_RULES, existingPolicy: "update_different" as const };
  const preview = buildImportPreview(
    [imported({ workflowStatus: "Enviado", sentAt: "2026-07-27T11:00:00-03:00", sentTimePrecise: true })],
    [existing()],
    rules,
  );
  assert.equal(preview.newMovements, 0);
  assert.equal(preview.updates, 1);
});
