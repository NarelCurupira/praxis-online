import assert from "node:assert/strict";
import test from "node:test";
import { buildReportModel, calculateDeadlines, calculateDistribution, calculateFlow, percentile } from "./reporting";
import type { ProcessMovement, TeamMember } from "./types";

const members: TeamMember[] = [
  { userId: "u1", fullName: "Ana", email: "ana@example.test", role: "admin", active: true, mfaRequired: true },
  { userId: "u2", fullName: "Bruno", email: "bruno@example.test", role: "assessor", active: true, mfaRequired: false },
];

function movement(overrides: Partial<ProcessMovement> & Pick<ProcessMovement, "movementId" | "caseId" | "receivedAt">): ProcessMovement {
  return {
    mpNumber: `MP-${overrides.caseId}`, judicialNumber: `0000000-00.2026.8.14.${String(overrides.caseId).padStart(4, "0")}`,
    className: "Apelação Cível", subject: "Assunto", deadlineAt: "2026-01-20", draftStatus: "Pendente",
    workflowStatus: "Recebido", sentAt: null, actionType: "Manifestação", notes: "", priority: "Normal", documentPath: "", elapsedHours: null,
    sociallyRelevant: false, extremelyComplex: false, socialTheme: "", relevanceReason: "", fundamentalRight: "", affectedGroup: "", reach: "", territorialScope: "", impactType: "", socialResult: "", sdgs: [], complexityReason: "", deletedAt: null,
    assignedTo: "u1", assignedName: "Ana", ...overrides,
  } as ProcessMovement;
}

test("estoque inicial, fluxo e estoque final são conciliados", () => {
  const records = [
    movement({ movementId: 1, caseId: 1, receivedAt: "2025-12-20", workflowStatus: "Enviado", sentAt: "2026-01-05T10:00:00", elapsedHours: 12 }),
    movement({ movementId: 2, caseId: 2, receivedAt: "2026-01-03", workflowStatus: "Enviado", sentAt: "2026-01-04T10:00:00", elapsedHours: 6 }),
    movement({ movementId: 3, caseId: 3, receivedAt: "2026-01-06" }),
  ];
  assert.deepEqual(calculateFlow(records, "2026-01-01", "2026-01-31"), {
    initialStock: 1, received: 2, sent: 2, balance: 0, finalStock: 1, reconciliationDifference: 0, sentReceivedRatio: 100,
  });
});

test("prazos distinguem concluídos, pendentes e sem prazo", () => {
  const records = [
    movement({ movementId: 1, caseId: 1, receivedAt: "2026-01-01", workflowStatus: "Enviado", sentAt: "2026-01-10T15:00:00", deadlineAt: "2026-01-10" }),
    movement({ movementId: 2, caseId: 2, receivedAt: "2026-01-01", workflowStatus: "Enviado", sentAt: "2026-01-12T15:00:00", deadlineAt: "2026-01-10" }),
    movement({ movementId: 3, caseId: 3, receivedAt: "2026-01-01", deadlineAt: "2026-02-10" }),
    movement({ movementId: 4, caseId: 4, receivedAt: "2026-01-01", deadlineAt: "2026-02-02" }),
    movement({ movementId: 5, caseId: 5, receivedAt: "2026-01-01", deadlineAt: "2026-01-20" }),
    movement({ movementId: 6, caseId: 6, receivedAt: "2026-01-01", deadlineAt: "" }),
  ];
  const result = calculateDeadlines(records, "2026-01-01", "2026-01-31", 3);
  assert.equal(result.completedOnTime, 1); assert.equal(result.completedLate, 1);
  assert.equal(result.pendingOnTime, 1); assert.equal(result.pendingNear, 1); assert.equal(result.pendingOverdue, 1); assert.equal(result.noDeadline, 1);
  assert.equal(result.completionCompliance, 50); assert.equal(result.currentConformity, 60);
});

test("estatísticas de tramitação usam horas úteis já calculadas", () => {
  const values = [1, 2, 6, 12, 30];
  const records = values.map((elapsedHours, index) => movement({ movementId: index + 1, caseId: index + 1, receivedAt: "2026-01-01", workflowStatus: "Enviado", sentAt: `2026-01-${String(index + 1).padStart(2, "0")}T12:00:00`, elapsedHours }));
  const result = calculateDistribution(records, "2026-01-01", "2026-01-31");
  assert.equal(result.mean, 10.2); assert.equal(result.median, 6); assert.equal(result.p75, 12); assert.equal(result.p90, 22.8);
  assert.equal(result.withinOneBusinessDay, 3); assert.equal(result.withinThreeBusinessDays, 4);
  assert.equal(percentile([], .5), null);
});

test("categorias de destaque são exclusivas e ODS múltiplos são contados por processo", () => {
  const records = [
    movement({ movementId: 1, caseId: 1, receivedAt: "2026-01-02", sociallyRelevant: true, sdgs: ["ODS 3", "ODS 16", "ODS 16"] }),
    movement({ movementId: 2, caseId: 2, receivedAt: "2026-01-03", extremelyComplex: true }),
    movement({ movementId: 3, caseId: 3, receivedAt: "2026-01-04", sociallyRelevant: true, extremelyComplex: true, sdgs: ["ODS 16"] }),
    movement({ movementId: 4, caseId: 4, receivedAt: "2026-01-05" }),
  ];
  const model = buildReportModel(records, members, { startDate: "2026-01-01", endDate: "2026-01-31", scope: "team", className: "all", actionType: "all", highlight: "all" });
  assert.deepEqual(model.highlights, { socialOnly: 1, complexOnly: 1, both: 1, socialTotal: 2, complexTotal: 2, total: 3 });
  assert.deepEqual(model.relevance.sdgs.map((item) => [item.label, item.value]), [["ODS 16", 2], ["ODS 3", 1]]);
});

test("filtros de usuário, classe, providência e ambas as classificações afetam todo o modelo", () => {
  const records = [
    movement({ movementId: 1, caseId: 1, receivedAt: "2026-01-02", assignedTo: "u1", sociallyRelevant: true, extremelyComplex: true, actionType: "DI" }),
    movement({ movementId: 2, caseId: 2, receivedAt: "2026-01-03", assignedTo: "u2", sociallyRelevant: true, extremelyComplex: true, actionType: "Manifestação" }),
  ];
  const model = buildReportModel(records, members, { startDate: "2026-01-01", endDate: "2026-01-31", scope: "u1", className: "Apelação Cível", actionType: "Desnecessária Intervenção", highlight: "both" });
  assert.equal(model.population.length, 1); assert.equal(model.users.length, 1); assert.equal(model.users[0].userId, "u1");
});
