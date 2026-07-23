import { mkdirSync, writeFileSync } from "node:fs";
import { buildReportFileName, buildReportModel } from "../src/reporting";
import { generateManagementReportPdf } from "../src/reportPdf";
import type { ProcessMovement, TeamMember } from "../src/types";

const members: TeamMember[] = [
  { userId: "ana", fullName: "Ana Martins", email: "ana@exemplo.test", role: "admin", active: true, mfaRequired: true },
  { userId: "bruno", fullName: "Bruno Silva", email: "bruno@exemplo.test", role: "assessor", active: true, mfaRequired: false },
  { userId: "carla", fullName: "Carla Souza", email: "carla@exemplo.test", role: "assessor", active: true, mfaRequired: false },
];

function record(index: number): ProcessMovement {
  const day = (index % 26) + 1; const received = `2026-06-${String(day).padStart(2, "0")}`; const sent = index % 5 === 0 ? null : `2026-06-${String(Math.min(30, day + index % 4)).padStart(2, "0")}T15:00:00`;
  const social = index % 4 === 0; const complex = index % 7 === 0;
  return {
    movementId: index, caseId: index, mpNumber: `08.2026.${String(index).padStart(8, "0")}-0`, judicialNumber: `${String(index).padStart(7, "0")}-00.2026.8.14.0001`,
    className: ["Apelação Cível", "Agravo de Instrumento", "Ação Civil Pública"][index % 3], subject: social ? "Política pública de saúde e proteção de grupo vulnerável" : "Controvérsia processual de rotina",
    receivedAt: received, deadlineAt: index % 11 === 0 ? "" : `2026-06-${String(Math.min(30, day + 5)).padStart(2, "0")}`,
    draftStatus: sent ? "Minutado" : "Pendente", workflowStatus: sent ? "Enviado" : "Em análise", sentAt: sent,
    actionType: ["Manifestação", "DI", "Diligência", "Contrarrazões"][index % 4], notes: "", priority: index % 9 === 0 ? "Alta" : "Normal", documentPath: "", elapsedHours: sent ? [1.5, 3, 6, 12, 24, 42][index % 6] : null,
    sociallyRelevant: social, extremelyComplex: complex, socialTheme: social ? ["Saúde pública", "Infância", "Meio ambiente"][index % 3] : "",
    relevanceReason: social ? "A controvérsia pode produzir efeitos coletivos e orientar a proteção de direitos fundamentais." : "", fundamentalRight: social ? "Saúde; dignidade" : "", affectedGroup: social ? "Crianças; famílias vulneráveis" : "",
    reach: social ? ["Coletivo", "Difuso", "Estrutural"][index % 3] : "", territorialScope: social ? ["Municipal", "Regional", "Estadual"][index % 3] : "", impactType: social ? ["Direto", "Indireto", "Reflexo"][index % 3] : "",
    socialResult: social ? "Espera-se ampliar o acesso à política pública e evitar a repetição da lesão." : "", sdgs: social ? ["ODS 3 — Saúde e bem-estar", "ODS 16 — Paz, justiça e instituições eficazes"] : [], complexityReason: complex ? "Multiplicidade de partes, prova técnica extensa e questão jurídica sensível." : "",
    deletedAt: null, assignedTo: members[index % members.length].userId, assignedName: members[index % members.length].fullName,
  };
}

const records = Array.from({ length: 48 }, (_, index) => record(index + 1));
const model = buildReportModel(records, members, { startDate: "2026-06-01", endDate: "2026-06-30", scope: "team", className: "all", actionType: "all", highlight: "all", nearDueDays: 3 });
const bytes = generateManagementReportPdf(model, { mode: "complete", members, generatedAt: new Date("2026-07-22T10:30:00-03:00") });
mkdirSync("output/pdf", { recursive: true });
writeFileSync(`output/pdf/${buildReportFileName("complete", model, members)}`, new Uint8Array(bytes));
