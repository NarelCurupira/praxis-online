import { jsPDF } from "jspdf";
import { generateManagementReportPdf } from "./reportPdf";
import type { ReportModel, ReportMode } from "./reporting";
import type { TeamMember, WorkspaceSettings } from "./types";
import { PRAXIS_VERSION } from "./version";

interface Options {
  mode: ReportMode;
  members: TeamMember[];
  settings: WorkspaceSettings;
  generatedAt?: Date;
  comparisonModel?: ReportModel;
  comparisonCurrentModel?: ReportModel;
}

const mandatoryDisclaimer = "Relatório gerencial auxiliar; não substitui os sistemas oficiais da Instituição.";

type RGB = [number, number, number];

const PRAXIS_NAVY: RGB = [10, 43, 82];
const PRAXIS_PRIMARY: RGB = [45, 127, 249];
const PRAXIS_PRIMARY_FILL: RGB = [23, 105, 210];
const PRAXIS_LIGHT_BLUE: RGB = [140, 198, 255];
const PRAXIS_SUCCESS: RGB = [20, 128, 74];
const PRAXIS_WARNING: RGB = [183, 121, 31];
const PRAXIS_DANGER: RGB = [199, 62, 62];
const PRAXIS_MUTED: RGB = [107, 114, 128];
const PRAXIS_BORDER: RGB = [220, 227, 236];
const PRAXIS_DIVIDER: RGB = [229, 231, 235];
const PRAXIS_SURFACE: RGB = [248, 250, 252];
const PRAXIS_SURFACE_SUBTLE: RGB = [243, 247, 252];

const COLOR_REMAP = new Map<string, RGB>([
  ["16,42,67", PRAXIS_NAVY],
  ["30,96,145", PRAXIS_PRIMARY_FILL],
  ["155,187,212", PRAXIS_LIGHT_BLUE],
  ["42,137,117", PRAXIS_SUCCESS],
  ["184,138,36", PRAXIS_WARNING],
  ["190,66,55", PRAXIS_DANGER],
  ["98,125,152", PRAXIS_MUTED],
  ["220,228,235", PRAXIS_BORDER],
  ["226,233,239", PRAXIS_DIVIDER],
  ["241,245,249", PRAXIS_SURFACE_SUBTLE],
  ["249,251,253", PRAXIS_SURFACE],
]);

function anonymizeModel(model: ReportModel | undefined, names: Map<string, string>): ReportModel | undefined {
  if (!model) return undefined;
  const clone = structuredClone(model) as ReportModel;
  clone.users = clone.users.map((user) => ({ ...user, name: names.get(user.userId) ?? "Usuário" }));
  const rewrite = (record: typeof clone.scopedRecords[number]) => ({
    ...record,
    assignedName: names.get(record.assignedTo) ?? "Usuário",
  });
  clone.scopedRecords = clone.scopedRecords.map(rewrite);
  clone.population = clone.population.map(rewrite);
  clone.highlightedProcesses = clone.highlightedProcesses.map(rewrite);
  return clone;
}

function remapColorArgs(args: unknown[]): unknown[] {
  if (args.length < 3 || !args.slice(0, 3).every((item) => typeof item === "number")) return args;
  const key = `${args[0]},${args[1]},${args[2]}`;
  const mapped = COLOR_REMAP.get(key);
  return mapped ? [...mapped, ...args.slice(3)] : args;
}

function horizontalOverlap(a: { x: number; w: number }, b: { x: number; w: number }): boolean {
  return a.x < b.x + b.w - 0.6 && a.x + a.w > b.x + 0.6;
}

function verticalOverlap(a: { y: number; h: number }, b: { y: number; h: number }): boolean {
  return a.y < b.y + b.h + 0.5 && a.y + a.h + 0.5 > b.y;
}

export function generateConfiguredManagementReportPdf(model: ReportModel, options: Options): number[] {
  const teamReport = model.filters.scope === "team";
  const aliases = new Map<string, string>();
  const members = options.members.map((member, index) => {
    const alias = `Usuário ${index + 1}`;
    aliases.set(member.userId, alias);
    return teamReport && !options.settings.allowNamedComparisons
      ? { ...member, fullName: alias, displayName: alias }
      : member;
  });

  const reportModel = teamReport && !options.settings.allowNamedComparisons ? anonymizeModel(model, aliases)! : model;
  const comparisonModel = teamReport && !options.settings.allowNamedComparisons
    ? anonymizeModel(options.comparisonModel, aliases)
    : options.comparisonModel;
  const comparisonCurrentModel = teamReport && !options.settings.allowNamedComparisons
    ? anonymizeModel(options.comparisonCurrentModel, aliases)
    : options.comparisonCurrentModel;

  const prototype = jsPDF.prototype as any;
  const originalText = prototype.text;
  const originalOutput = prototype.output;
  const originalRoundedRect = prototype.roundedRect;
  const originalRect = prototype.rect;
  const originalSetFillColor = prototype.setFillColor;
  const originalSetDrawColor = prototype.setDrawColor;
  const originalSetTextColor = prototype.setTextColor;

  let waitingHeaderSubtitle = false;

  type TransitRect = { page: number; x: number; y: number; w: number; h: number };
  const transitRects: TransitRect[] = [];
  let pendingTransitTextShift: { page: number; delta: number } | null = null;

  const pageNumber = (doc: any): number => {
    const info = doc.getCurrentPageInfo?.();
    if (typeof info?.pageNumber === "number") return info.pageNumber;
    return Number(doc.internal?.getCurrentPageInfo?.()?.pageNumber ?? 1);
  };

  prototype.setFillColor = function patchedSetFillColor(...args: unknown[]) {
    return originalSetFillColor.call(this, ...remapColorArgs(args));
  };

  prototype.setDrawColor = function patchedSetDrawColor(...args: unknown[]) {
    return originalSetDrawColor.call(this, ...remapColorArgs(args));
  };

  prototype.setTextColor = function patchedSetTextColor(...args: unknown[]) {
    return originalSetTextColor.call(this, ...remapColorArgs(args));
  };

  prototype.rect = function patchedRect(...args: unknown[]) {
    const [x, , width, height] = args;
    const pageWidth = Number(this.internal?.pageSize?.getWidth?.() ?? 0);
    if (
      typeof x === "number" &&
      typeof width === "number" &&
      typeof height === "number" &&
      Math.abs(x) < 0.01 &&
      pageWidth > 0 &&
      width >= pageWidth - 0.5 &&
      height > 0 &&
      height <= 1.5
    ) {
      originalSetFillColor.call(this, ...PRAXIS_PRIMARY);
    }
    return originalRect.call(this, ...args);
  };

  /*
   * Os rótulos de Mediana/P75/P90 do gráfico de tempo usam roundedRect(.8,.8).
   * O algoritmo-base evita colisões enquanto há espaço acima da barra, mas,
   * quando vários rótulos chegam ao limite superior do gráfico, todos podem
   * ser comprimidos para a mesma coordenada. Esta camada resolve a colisão
   * final sem alterar os dados ou as escalas.
   */
  prototype.roundedRect = function patchedRoundedRect(...args: unknown[]) {
    const [x, y, width, height, rx, ry] = args;
    if (
      typeof x === "number" &&
      typeof y === "number" &&
      typeof width === "number" &&
      typeof height === "number" &&
      typeof rx === "number" &&
      typeof ry === "number" &&
      Math.abs(rx - 0.8) < 0.01 &&
      Math.abs(ry - 0.8) < 0.01 &&
      width >= 20 &&
      height >= 3.5 &&
      height <= 9
    ) {
      const page = pageNumber(this);
      let adjustedY = y;
      const candidate = { page, x, y: adjustedY, w: width, h: height };

      for (let pass = 0; pass < 10; pass += 1) {
        const collision = transitRects.find((item) =>
          item.page === page &&
          horizontalOverlap(candidate, item) &&
          verticalOverlap(candidate, item)
        );
        if (!collision) break;
        adjustedY = collision.y + collision.h + 1.1;
        candidate.y = adjustedY;
      }

      const pageHeight = Number(this.internal?.pageSize?.getHeight?.() ?? 210);
      adjustedY = Math.min(adjustedY, pageHeight - height - 22);
      candidate.y = adjustedY;
      transitRects.push(candidate);
      pendingTransitTextShift = { page, delta: adjustedY - y };

      const nextArgs = [...args];
      nextArgs[1] = adjustedY;
      return originalRoundedRect.call(this, ...nextArgs);
    }

    return originalRoundedRect.call(this, ...args);
  };

  prototype.text = function patchedText(value: unknown, ...args: unknown[]) {
    let next = value;

    if (pendingTransitTextShift) {
      const joined = Array.isArray(next) ? next.join(" ") : String(next ?? "");
      const isTransitMetric = /^(Mediana|P75|P90)(?:\/(?:Mediana|P75|P90))*\s*:/.test(joined);
      if (
        isTransitMetric &&
        pageNumber(this) === pendingTransitTextShift.page &&
        typeof args[1] === "number"
      ) {
        args[1] = args[1] + pendingTransitTextShift.delta;
      }
      pendingTransitTextShift = null;
    }

    if (typeof next === "string") {
      if (next.startsWith("PRÁXIS - RELATÓRIO") || next.startsWith("ANEXO DE PROCESSOS")) {
        waitingHeaderSubtitle = true;
      } else if (waitingHeaderSubtitle) {
        const institutional = [
          options.settings.unitName,
          options.settings.leadProsecutor ? `Procurador responsável: ${options.settings.leadProsecutor}` : "",
        ].filter(Boolean).join(" | ");
        if (institutional) next = `${next} | ${institutional}`;
        waitingHeaderSubtitle = false;
      } else if (next === mandatoryDisclaimer) {
        next = options.settings.reportFooter?.trim()
          ? `${mandatoryDisclaimer} ${options.settings.reportFooter.trim()}`
          : mandatoryDisclaimer;
      }
    }

    return originalText.call(this, next, ...args);
  };

  prototype.output = function patchedOutput(...args: unknown[]) {
    const doc = this as jsPDF & { __praxisConfigured?: boolean };
    if (!doc.__praxisConfigured) {
      doc.__praxisConfigured = true;
      const pages = doc.getNumberOfPages();
      const unit = options.settings.unitName?.trim();
      const prosecutor = options.settings.leadProsecutor?.trim();

      for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        const width = doc.internal.pageSize.getWidth();
        const height = doc.internal.pageSize.getHeight();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.2);
        doc.setTextColor(...PRAXIS_MUTED);
        if (page === 1 && unit) {
          doc.text(unit, width - 10, 5, { align: "right" });
          if (prosecutor) doc.text(`Procurador responsável: ${prosecutor}`, width - 10, 8, { align: "right" });
        }
        if (options.settings.reportFooter?.trim()) doc.text(options.settings.reportFooter.trim(), 10, height - 3);
        doc.text(`Práxis ${PRAXIS_VERSION}`, width - 10, height - 3, { align: "right" });
      }
    }
    return originalOutput.call(this, ...args);
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
    prototype.text = originalText;
    prototype.output = originalOutput;
    prototype.roundedRect = originalRoundedRect;
    prototype.rect = originalRect;
    prototype.setFillColor = originalSetFillColor;
    prototype.setDrawColor = originalSetDrawColor;
    prototype.setTextColor = originalSetTextColor;
  }
}
