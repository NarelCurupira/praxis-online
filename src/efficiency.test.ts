import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEfficiencyModel, calculateEfficiencyTime, coverageFor, formatEfficiencyDuration,
  hasCompleteTime, previousEquivalentRange,
} from "./efficiency";
import type { ProcessMovement, TeamMember } from "./types";

const marcos: TeamMember = {
  userId: "marcos", fullName: "Marcos Antonio Santos Machado", email: "marcos@example.test",
  role: "admin", active: true, mfaRequired: true, historicalCoverageSince: "2024-01-01",
};
const hurias: TeamMember = {
  userId: "hurias", fullName: "Hurias Pinheiro Andrade", email: "hurias@example.test",
  role: "assessor", active: true, mfaRequired: false, historicalCoverageSince: "2026-01-01",
};

function movement(overrides: Partial<ProcessMovement> & Pick<ProcessMovement, "movementId" | "caseId" | "receivedAt" | "assignedTo">): ProcessMovement {
  return {
    mpNumber: `MP-${overrides.caseId}`, judicialNumber: String(overrides.caseId),
    className: "Agravo de Instrumento", subject: "Assunto", deadlineAt: "",
    draftStatus: "Pendente", workflowStatus: "Recebido", sentAt: null, actionType: "Manifestação",
    notes: "", priority: "Normal", documentPath: "", elapsedHours: null,
    sociallyRelevant: false, extremelyComplex: false, socialTheme: "", relevanceReason: "",
    fundamentalRight: "", affectedGroup: "", reach: "", territorialScope: "", impactType: "",
    socialResult: "", sdgs: [], complexityReason: "", deletedAt: null, assignedName: "",
    ...overrides,
  };
}

const records: ProcessMovement[] = [
  movement({ movementId: 1, caseId: 1, assignedTo: "marcos", receivedAt: "2025-02-03T00:00:00", workflowStatus: "Enviado", sentAt: "2025-02-03T00:00:00", elapsedHours: 0 }),
  movement({ movementId: 2, caseId: 2, assignedTo: "marcos", receivedAt: "2025-03-05T09:00:00", workflowStatus: "Enviado", sentAt: "2025-03-05T10:30:00", elapsedHours: 1.5 }),
  movement({ movementId: 3, caseId: 3, assignedTo: "marcos", receivedAt: "2026-01-10T09:00:00", deadlineAt: "2026-01-20", workflowStatus: "Enviado", sentAt: "2026-01-10T12:00:00", elapsedHours: 3, sociallyRelevant: true }),
  movement({ movementId: 4, caseId: 4, assignedTo: "hurias", receivedAt: "2026-02-10T09:00:00", deadlineAt: "2026-02-15", extremelyComplex: true }),
  movement({ movementId: 5, caseId: 5, assignedTo: "hurias", receivedAt: "2026-07-20T00:00:00", workflowStatus: "Enviado", sentAt: "2026-07-20T00:00:00", elapsedHours: 0, sociallyRelevant: true, extremelyComplex: true }),
];

test("Marcos possui cobertura em 2025", () => {
  assert.equal(coverageFor(marcos, { startDate: "2025-01-01", endDate: "2025-12-31" }).status, "covered");
});
test("Hurias não possui histórico em 2025", () => {
  assert.equal(coverageFor(hurias, { startDate: "2025-01-01", endDate: "2025-12-31" }).status, "unavailable");
});
test("equipe em 2025 informa cobertura parcial sem zerar Hurias", () => {
  const model = buildEfficiencyModel(records, [marcos, hurias], "team", { startDate: "2025-01-01", endDate: "2025-12-31" }, "2026-07-24");
  assert.deepEqual(model.coverage, { covered: 1, partial: 0, unavailable: 1, total: 2, isComplete: false });
  assert.equal(model.rows.find((row) => row.member.userId === "hurias")?.flow, null);
});
test("equipe em 2026 possui cobertura completa", () => {
  const model = buildEfficiencyModel(records, [marcos, hurias], "team", { startDate: "2026-01-01", endDate: "2026-07-24" }, "2026-07-24");
  assert.equal(model.coverage.isComplete, true);
  assert.equal(model.coverage.covered, 2);
});
test("comparação 2025/2026 usa somente a equipe comparável", () => {
  const model = buildEfficiencyModel(records, [marcos, hurias], "team", { startDate: "2026-01-01", endDate: "2026-07-24" }, "2026-07-24");
  assert.deepEqual(model.comparable?.members.map((member) => member.userId), ["marcos"]);
});
test("período equivalente preserva dia e mês", () => {
  assert.deepEqual(previousEquivalentRange({ startDate: "2026-01-01", endDate: "2026-07-24" }), { startDate: "2025-01-01", endDate: "2025-07-24" });
});
test("29 de fevereiro é ajustado no ano anterior", () => {
  assert.equal(previousEquivalentRange({ startDate: "2024-02-29", endDate: "2024-02-29" }).startDate, "2023-02-28");
});
test("meses futuros são nulos e não zeros", () => {
  const model = buildEfficiencyModel(records, [marcos], "marcos", { startDate: "2026-01-01", endDate: "2026-12-31" }, "2026-07-24");
  assert.equal(model.trend.find((point) => point.key === "2026-08")?.received, null);
});
test("mês corrente é marcado como parcial", () => {
  const model = buildEfficiencyModel(records, [marcos], "marcos", { startDate: "2026-01-01", endDate: "2026-12-31" }, "2026-07-24");
  assert.equal(model.trend.find((point) => point.key === "2026-07")?.partial, true);
});
test("período coberto sem movimentação preserva zero real", () => {
  const model = buildEfficiencyModel([], [marcos], "marcos", { startDate: "2025-08-01", endDate: "2025-08-31" }, "2026-07-24");
  assert.deepEqual(model.flow, { received: 0, sent: 0, balance: 0, currentPending: 0 });
});
test("cobertura não configurada é inferida pelos registros existentes", () => {
  const unknown = { ...hurias, historicalCoverageSince: null };
  const model = buildEfficiencyModel(records, [unknown], "hurias", { startDate: "2026-01-01", endDate: "2026-12-31" }, "2026-07-24");
  assert.equal(model.coverage.covered, 1);
  assert.equal(model.rows[0].coverage.since, "2026-02-10");
  assert.equal(model.flow?.received, 2);
});
test("data configurada posterior não oculta movimentações já cadastradas", () => {
  const lateCoverage = { ...marcos, historicalCoverageSince: "2026-07-24" };
  const model = buildEfficiencyModel(records, [lateCoverage], "marcos", { startDate: "2025-01-01", endDate: "2025-12-31" }, "2026-07-24");
  assert.equal(model.rows[0].coverage.since, "2025-02-03");
  assert.equal(model.flow?.received, 2);
});
test("envio na mesma data com zero é apresentado como mesmo dia útil", () => {
  const time = calculateEfficiencyTime(records.slice(0, 1), { startDate: "2025-01-01", endDate: "2025-12-31" });
  assert.equal(formatEfficiencyDuration(time.median, time), "Mesmo dia útil");
});
test("horário incompleto não entra no indicador de duas horas", () => {
  const time = calculateEfficiencyTime(records.slice(0, 2), { startDate: "2025-01-01", endDate: "2025-12-31" });
  assert.equal(time.sentCount, 2);
  assert.equal(time.preciseCount, 1);
  assert.equal(time.withinTwoHours, 1);
});
test("detecção de horário distingue meia-noite importada", () => {
  assert.equal(hasCompleteTime("2026-01-01T00:00:00"), false);
  assert.equal(hasCompleteTime("2026-01-01T09:30:00"), true);
});
test("pendências atuais independem do ano histórico selecionado", () => {
  const model = buildEfficiencyModel(records, [hurias], "hurias", { startDate: "2026-01-01", endDate: "2026-01-31" }, "2026-07-24");
  assert.equal(model.flow?.currentPending, 1);
});
test("pendência vencida é distinguida", () => {
  const model = buildEfficiencyModel(records, [hurias], "hurias", { startDate: "2026-01-01", endDate: "2026-07-24" }, "2026-07-24");
  assert.equal(model.rows[0].pendingOverdue, 1);
});
test("usuário sem pendência exibe zero real", () => {
  const model = buildEfficiencyModel(records, [marcos], "marcos", { startDate: "2026-01-01", endDate: "2026-07-24" }, "2026-07-24");
  assert.equal(model.flow?.currentPending, 0);
});
test("distribuição recente usa janela fixa de 30 dias", () => {
  const model = buildEfficiencyModel(records, [marcos, hurias], "team", { startDate: "2025-01-01", endDate: "2025-12-31" }, "2026-07-24");
  assert.equal(model.load.find((row) => row.member.userId === "hurias")?.recentReceived, 1);
});
test("composição mantém categorias exclusivas", () => {
  const model = buildEfficiencyModel(records, [marcos, hurias], "team", { startDate: "2026-01-01", endDate: "2026-07-24" }, "2026-07-24");
  const marcosComposition = model.composition.find((row) => row.member.userId === "marcos");
  const huriasComposition = model.composition.find((row) => row.member.userId === "hurias");
  assert.deepEqual([marcosComposition?.social, marcosComposition?.complex, marcosComposition?.both], [1, 0, 0]);
  assert.deepEqual([huriasComposition?.social, huriasComposition?.complex, huriasComposition?.both], [0, 1, 1]);
});
test("visão individual não mistura dados do outro usuário", () => {
  const model = buildEfficiencyModel(records, [marcos, hurias], "marcos", { startDate: "2026-01-01", endDate: "2026-07-24" }, "2026-07-24");
  assert.equal(model.selectedRecords.every((record) => record.assignedTo === "marcos"), true);
});
