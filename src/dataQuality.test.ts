import assert from "node:assert/strict";
import test from "node:test";
import { inspectDataQuality } from "./dataQuality";
import type { ProcessMovement } from "./types";

function movement(overrides: Partial<ProcessMovement> = {}): ProcessMovement {
  return {
    movementId: 1,
    caseId: 1,
    mpNumber: "08.2026.00000001-0",
    judicialNumber: "0000001-00.2026.8.14.0001",
    className: "Apelação Cível",
    subject: "Assunto",
    receivedAt: "2026-07-16T03:00:00.000Z",
    receivedTimePrecise: false,
    deadlineAt: "2026-07-16",
    draftStatus: "Minutado",
    workflowStatus: "Enviado",
    sentAt: "2026-07-16T00:00:00.000Z",
    sentTimePrecise: false,
    actionType: "Manifestação",
    notes: "",
    priority: "Normal",
    documentPath: "",
    elapsedHours: 0,
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
    assignedTo: "u1",
    assignedName: "Usuário",
    ...overrides,
  };
}

test("timestamps históricos sem hora no mesmo dia não geram envio anterior", () => {
  const issues = inspectDataQuality([movement()]);
  assert.equal(issues.some((issue) => issue.category === "Envio anterior à entrada"), false);
});

test("prazo no mesmo dia da entrada não é considerado anterior por causa da hora", () => {
  const issues = inspectDataQuality([movement({
    receivedAt: "2026-07-16T18:00:00.000Z",
    receivedTimePrecise: true,
    sentAt: null,
    sentTimePrecise: false,
    workflowStatus: "Recebido",
  })]);
  assert.equal(issues.some((issue) => issue.category === "Prazo anterior à entrada"), false);
});

test("horários precisos realmente invertidos continuam críticos", () => {
  const issues = inspectDataQuality([movement({
    receivedAt: "2026-07-16T18:00:00.000Z",
    receivedTimePrecise: true,
    sentAt: "2026-07-16T17:00:00.000Z",
    sentTimePrecise: true,
  })]);
  assert.equal(issues.some((issue) => issue.category === "Envio anterior à entrada"), true);
});

test("data de envio realmente anterior continua crítica quando não há horários", () => {
  const issues = inspectDataQuality([movement({
    receivedAt: "2026-07-16T03:00:00.000Z",
    receivedTimePrecise: false,
    sentAt: "2026-07-15T00:00:00.000Z",
    sentTimePrecise: false,
  })]);
  assert.equal(issues.some((issue) => issue.category === "Envio anterior à entrada"), true);
});
