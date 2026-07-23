import { mkdirSync, writeFileSync } from "node:fs";
import { buildReportFileName, buildReportModel, type ReportMode } from "../src/reporting";
import { generateManagementReportPdf } from "../src/reportPdf";
import type { ProcessMovement, TeamMember } from "../src/types";

const members: TeamMember[] = [
  { userId: "marcos", fullName: "Marcos Antonio Santos Machado", email: "marcos@exemplo.test", role: "admin", active: true, mfaRequired: true },
  { userId: "helena", fullName: "Helena Pereira Andrade", email: "helena@exemplo.test", role: "assessor", active: true, mfaRequired: false },
  { userId: "joao", fullName: "João Ribeiro", email: "joao@exemplo.test", role: "assessor", active: true, mfaRequired: false },
];

function movement(index: number, overrides: Partial<ProcessMovement> = {}): ProcessMovement {
  const month = ((index - 1) % 7) + 1;
  const day = ((index * 3) % 20) + 2;
  const receivedAt = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const sameDay = index % 4 === 0;
  const sentDay = sameDay ? day : Math.min(27, day + (index % 3) + 1);
  const sentAt = index % 5 === 0 ? null : `2026-${String(month).padStart(2, "0")}-${String(sentDay).padStart(2, "0")}T15:00:00`;
  const social = index % 3 === 0;
  const complex = index % 7 === 0;
  const assigned = members[(index - 1) % members.length];
  return {
    movementId: index,
    caseId: index,
    mpNumber: `08.2026.${String(index).padStart(8, "0")}-0`,
    judicialNumber: `${String(index).padStart(7, "0")}-00.2026.8.14.0001`,
    className: ["Apelação Cível", "Agravo de Instrumento", "Ação Civil Pública", "Mandado de Segurança"][index % 4],
    subject: social ? "Política pública e proteção de direitos fundamentais de grupo vulnerável" : "Controvérsia processual de rotina",
    receivedAt,
    deadlineAt: index % 6 === 0 ? "" : `2026-${String(month).padStart(2, "0")}-${String(Math.min(28, day + 7)).padStart(2, "0")}`,
    draftStatus: sentAt ? "Minutado" : "Pendente",
    workflowStatus: sentAt ? "Enviado" : "Em análise",
    sentAt,
    actionType: ["Manifestação", "DI", "Diligência", "Contrarrazões"][index % 4],
    notes: "",
    priority: index % 9 === 0 ? "Alta" : "Normal",
    documentPath: "",
    elapsedHours: sentAt ? (sameDay ? 0 : [3, 6, 12, 24, 42][index % 5]) : null,
    sociallyRelevant: social,
    extremelyComplex: complex,
    socialTheme: social ? ["Saúde", "Educação", `Tema descritivo específico ${index}`][index % 3] : "",
    relevanceReason: social ? "A controvérsia alcança grupo vulnerável e pode orientar a prestação de serviço público em situações semelhantes." : "",
    fundamentalRight: social ? ["Direito à saúde", "Direito à educação", `Direito descrito especificamente ${index}`][index % 3] : "",
    affectedGroup: social ? ["Usuários de serviços públicos", "Estudantes", `Grupo afetado específico ${index}`][index % 3] : "",
    reach: social ? ["Coletivo", "Difuso", "Estrutural"][index % 3] : "",
    territorialScope: social ? ["Municipal", "Regional", "Estadual"][index % 3] : "",
    impactType: social ? "Direto" : "",
    socialResult: social ? "Espera-se ampliar o acesso à política pública e reduzir a repetição da lesão identificada." : "",
    sdgs: social ? ["ODS 3 - Saúde e bem-estar", "ODS 16 - Paz, justiça e instituições eficazes"] : [],
    complexityReason: complex ? "Multiplicidade de partes, prova técnica extensa e questão jurídica sensível, com necessidade de exame articulado de documentos e precedentes." : "",
    deletedAt: null,
    assignedTo: assigned.userId,
    assignedName: assigned.fullName,
    ...overrides,
  };
}

const baseRecords = Array.from({ length: 24 }, (_, index) => movement(index + 1));
const fixedTime = new Date("2026-07-23T09:30:00-03:00");
const commonFilters = { startDate: "2026-01-01", endDate: "2026-07-22", className: "all", actionType: "all", highlight: "all" as const, nearDueDays: 3 };

type Scenario = {
  directory: string;
  mode: ReportMode;
  records: ProcessMovement[];
  scenarioMembers?: TeamMember[];
  scope: string;
};

const allSent = baseRecords.map((record, index) => ({
  ...record,
  workflowStatus: "Enviado" as const,
  sentAt: record.sentAt ?? `${record.receivedAt}T15:00:00`,
  elapsedHours: record.elapsedHours ?? (index % 3 === 0 ? 0 : 6),
}));
const overdue = baseRecords.map((record, index) => index === 0 ? { ...record, workflowStatus: "Em análise" as const, sentAt: null, elapsedHours: null, deadlineAt: "2026-02-01" } : record);
const noDeadline = baseRecords.map((record) => ({ ...record, deadlineAt: "" }));
const noHighlights = baseRecords.map((record) => ({
  ...record,
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
}));
const oneMember = [members[0]];
const oneMemberRecords = baseRecords.map((record) => ({ ...record, assignedTo: members[0].userId, assignedName: members[0].fullName }));

const scenarios: Scenario[] = [
  { directory: "01-executivo-individual", mode: "executive", records: baseRecords, scope: "marcos" },
  { directory: "02-completo-individual", mode: "complete", records: baseRecords, scope: "marcos" },
  { directory: "03-executivo-equipe", mode: "executive", records: baseRecords, scope: "team" },
  { directory: "04-completo-equipe", mode: "complete", records: baseRecords, scope: "team" },
  { directory: "05-anexo-destacados", mode: "highlights", records: baseRecords, scope: "team" },
  { directory: "06-sem-pendencias", mode: "executive", records: allSent, scope: "team" },
  { directory: "07-com-pendentes-vencidos", mode: "executive", records: overdue, scope: "team" },
  { directory: "08-sem-prazo-aplicavel", mode: "executive", records: noDeadline, scope: "team" },
  { directory: "09-sem-processos-destacados", mode: "complete", records: noHighlights, scope: "team" },
  { directory: "10-apenas-um-usuario", mode: "executive", records: oneMemberRecords, scenarioMembers: oneMember, scope: "team" },
];

for (const scenario of scenarios) {
  const scenarioMembers = scenario.scenarioMembers ?? members;
  const model = buildReportModel(scenario.records, scenarioMembers, { ...commonFilters, scope: scenario.scope });
  const bytes = generateManagementReportPdf(model, { mode: scenario.mode, members: scenarioMembers, generatedAt: fixedTime });
  const directory = `output/pdf/scenarios/${scenario.directory}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/${buildReportFileName(scenario.mode, model, scenarioMembers)}`, new Uint8Array(bytes));
}
