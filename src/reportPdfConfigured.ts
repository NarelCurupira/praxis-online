import { jsPDF } from "jspdf";
import { generateManagementReportPdf } from "./reportPdf";
import type { ReportModel } from "./reporting";
import type { TeamMember, WorkspaceSettings } from "./types";
import type { ReportMode } from "./reporting";

interface Options {
  mode: ReportMode;
  members: TeamMember[];
  settings: WorkspaceSettings;
  generatedAt?: Date;
  comparisonModel?: ReportModel;
  comparisonCurrentModel?: ReportModel;
}

const mandatoryDisclaimer = "Relatório gerencial auxiliar; não substitui os sistemas oficiais da Instituição.";

function anonymizeModel(model: ReportModel | undefined, names: Map<string, string>): ReportModel | undefined {
  if (!model) return undefined;
  const clone = structuredClone(model) as ReportModel;
  clone.users = clone.users.map((user) => ({ ...user, name: names.get(user.userId) ?? "Usuário" }));
  const rewrite = (record: typeof clone.scopedRecords[number]) => ({ ...record, assignedName: names.get(record.assignedTo) ?? "Usuário" });
  clone.scopedRecords = clone.scopedRecords.map(rewrite);
  clone.population = clone.population.map(rewrite);
  clone.highlightedProcesses = clone.highlightedProcesses.map(rewrite);
  return clone;
}

export function generateConfiguredManagementReportPdf(model: ReportModel, options: Options): number[] {
  const teamReport = model.filters.scope === "team";
  const aliases = new Map<string, string>();
  const members = options.members.map((member, index) => {
    const alias = `Usuário ${index + 1}`;
    aliases.set(member.userId, alias);
    return teamReport && !options.settings.allowNamedComparisons ? { ...member, fullName: alias, displayName: alias } : member;
  });
  const reportModel = teamReport && !options.settings.allowNamedComparisons ? anonymizeModel(model, aliases)! : model;
  const comparisonModel = teamReport && !options.settings.allowNamedComparisons ? anonymizeModel(options.comparisonModel, aliases) : options.comparisonModel;
  const comparisonCurrentModel = teamReport && !options.settings.allowNamedComparisons ? anonymizeModel(options.comparisonCurrentModel, aliases) : options.comparisonCurrentModel;

  const originalText = jsPDF.prototype.text;
  let waitingHeaderSubtitle = false;
  (jsPDF.prototype as any).text = function patchedText(value: unknown, ...args: unknown[]) {
    let next = value;
    if (typeof next === "string") {
      if (next.startsWith("PRÁXIS - RELATÓRIO") || next.startsWith("ANEXO DE PROCESSOS")) {
        waitingHeaderSubtitle = true;
      } else if (waitingHeaderSubtitle) {
        const institutional = [options.settings.unitName, options.settings.leadProsecutor ? `Procurador responsável: ${options.settings.leadProsecutor}` : ""].filter(Boolean).join(" | ");
        if (institutional) next = `${next} | ${institutional}`;
        waitingHeaderSubtitle = false;
      } else if (next.startsWith("Escopo:") && options.settings.leadProsecutor) {
        next = `${next} | Procurador responsável: ${options.settings.leadProsecutor}`;
      } else if (next === mandatoryDisclaimer) {
        next = options.settings.reportFooter?.trim() ? `${mandatoryDisclaimer} ${options.settings.reportFooter.trim()}` : mandatoryDisclaimer;
      }
    }
    return (originalText as any).call(this, next, ...args);
  };

  try {
    return generateManagementReportPdf(reportModel, {
      mode: options.mode,
      members,
      generatedAt: options.generatedAt,
      comparisonModel,
      comparisonCurrentModel,
    });
  } finally {
    jsPDF.prototype.text = originalText;
  }
}
