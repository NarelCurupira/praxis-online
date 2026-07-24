import assert from "node:assert/strict";
import test from "node:test";
import { excelDateTime, localDatePart, toStorageTimestamp } from "./date";
import { buildReportModel } from "./reporting";
import type { ProcessMovement, TeamMember } from "./types";

test("datetime-local é armazenado como instante de Belém", () => {
  assert.equal(toStorageTimestamp("2026-07-24T15:30"), "2026-07-24T18:30:00.000Z");
});

test("data UTC é agrupada pelo dia local de Belém", () => {
  assert.equal(localDatePart("2026-07-24T02:30:00.000Z"), "2026-07-23");
});

test("planilha reconhece hora na mesma célula", () => {
  assert.deepEqual(excelDateTime("24/07/2026 15:30"), { value: "2026-07-24T15:30", precise: true });
});

test("planilha reconhece coluna separada de hora", () => {
  assert.deepEqual(excelDateTime("24/07/2026", "15:30"), { value: "2026-07-24T15:30", precise: true });
});

test("relatório infere cobertura pelos registros existentes", () => {
  const member: TeamMember = { userId: "a", fullName: "A", email: "a@example.test", role: "admin", active: true, mfaRequired: false, historicalCoverageSince: null };
  const record: ProcessMovement = {
    movementId: 1, caseId: 1, mpNumber: "MP", judicialNumber: "1", className: "Apelação Cível", subject: "Teste",
    receivedAt: "2026-01-02T12:00:00.000Z", receivedTimePrecise: true, deadlineAt: "", draftStatus: "Minutado",
    workflowStatus: "Enviado", sentAt: "2026-01-02T13:00:00.000Z", sentTimePrecise: true, actionType: "Manifestação",
    notes: "", priority: "Normal", documentPath: "", elapsedHours: 0, sociallyRelevant: false, extremelyComplex: false,
    socialTheme: "", relevanceReason: "", fundamentalRight: "", affectedGroup: "", reach: "", territorialScope: "",
    impactType: "", socialResult: "", sdgs: [], complexityReason: "", deletedAt: null, assignedTo: "a", assignedName: "A",
  };
  const model = buildReportModel([record], [member], { startDate: "2026-01-01", endDate: "2026-12-31", scope: "team", className: "all", actionType: "all", highlight: "all" });
  assert.equal(model.coverage.available, 1);
  assert.equal(model.flow.received, 1);
  assert.equal(model.flow.sent, 1);
});
