import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { categoryPresentation, pluralize, reportFilterDescription, reportScopeInfo, type CategoryMetric, type DistributionStats, type ReportMode, type ReportModel, type UserReportMetrics, WORKDAY_HOURS } from "./reporting";
import type { TeamMember } from "./types";
import { PRAXIS_VERSION } from "./version";

const INK: [number, number, number] = [16, 42, 67];
const BLUE: [number, number, number] = [30, 96, 145];
const BLUE_LIGHT: [number, number, number] = [155, 187, 212];
const GREEN: [number, number, number] = [42, 137, 117];
const GOLD: [number, number, number] = [184, 138, 36];
const RED: [number, number, number] = [190, 66, 55];
const GREY: [number, number, number] = [98, 125, 152];
const LIGHT: [number, number, number] = [241, 245, 249];
const disclaimer = "Relatório gerencial auxiliar; não substitui os sistemas oficiais da Instituição.";

export interface ReportPdfOptions { mode: ReportMode; members: TeamMember[]; generatedAt?: Date; comparisonModel?: ReportModel; comparisonCurrentModel?: ReportModel; }

function text(value: unknown): string {
  return String(value ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/’/g, "'");
}

function fmtNumber(value: number): string { return value.toLocaleString("pt-BR"); }
function fmtPct(value: number | null): string { return value == null ? "-" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`; }
function fmtDate(value: string): string { return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`)); }
function shortList(items: Array<{ label: string; value: number }>, limit = 3): string { return items.slice(0, limit).map((item) => `${item.label} (${item.value})`).join(", ") || "-"; }
function durationNumber(value: number): string { return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function chartNumber(value: number): string { return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 }); }
function formatDuration(value: number | null, stats?: DistributionStats, withEquivalent = false): string {
  if (value == null) return "Não disponível";
  if (value === 0) return stats?.zeroSameDate ? "Mesmo dia útil" : "Não disponível";
  const approximate = stats?.withoutCompleteTime ? "Aprox. " : "";
  if (withEquivalent && value > WORKDAY_HOURS) {
    const days = value / WORKDAY_HOURS;
    return `${approximate}${durationNumber(value)} h úteis - ${durationNumber(days)} ${days < 1.05 ? "dia útil" : "dias úteis"}`;
  }
  if (value > 8) {
    const days = value / WORKDAY_HOURS;
    return `${approximate}${durationNumber(days)} ${days < 1.05 ? "dia útil" : "dias úteis"}`;
  }
  return `${approximate}${durationNumber(value)} h úteis`;
}
function formatChartDuration(value: number, stats?: DistributionStats): string {
  if (value === 0) return stats?.zeroSameDate ? "Mesmo dia útil" : "Não disponível";
  if (value > WORKDAY_HOURS) return `${chartNumber(value)} h / ${chartNumber(value / WORKDAY_HOURS)} dias`;
  return `${chartNumber(value)} h`;
}
function deadlineRate(value: number | null): string {
  return value == null ? "Não aplicável" : fmtPct(value);
}
function deadlineBase(completed: number, applicable: number): string {
  return applicable
    ? `${completed} de ${applicable} ${pluralize(applicable, "processo com prazo aplicável", "processos com prazo aplicável")}`
    : "Nenhum processo com prazo no período";
}
function scopeText(model: ReportModel, members: TeamMember[]): string {
  const scope = reportScopeInfo(model, members);
  return scope.kind === "individual"
    ? `Escopo: Relatório individual | Responsável: ${scope.responsibleName}`
    : `Escopo: Relatório da equipe | ${scope.usersConsidered} ${pluralize(scope.usersConsidered, "usuário considerado", "usuários considerados")}`;
}

function roundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, fill: [number, number, number], stroke: [number, number, number] = fill) {
  doc.setFillColor(...fill); doc.setDrawColor(...stroke); doc.roundedRect(x, y, w, h, 2, 2, "FD");
}

function emptyChart(doc: jsPDF, x: number, y: number, w: number, h: number, message = "Sem dados para os filtros aplicados") {
  roundedRect(doc, x, y, w, h, [249, 251, 253], [220, 228, 235]);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
  doc.text(message, x + w / 2, y + h / 2, { align: "center" });
}

function chartTitle(doc: jsPDF, title: string, subtitle: string, x: number, y: number) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(text(title), x, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.1); doc.setTextColor(...GREY); doc.text(text(subtitle), x, y + 4.3);
}

function drawHorizontalBars(doc: jsPDF, data: CategoryMetric[], x: number, y: number, w: number, h: number, options: { title: string; subtitle: string; color?: [number, number, number]; maxItems?: number; showPercent?: boolean }) {
  chartTitle(doc, options.title, options.subtitle, x, y);
  const items = data.slice(0, options.maxItems ?? 8);
  if (!items.length) { emptyChart(doc, x, y + 7, w, h - 7); return; }
  const labelWidth = Math.min(w * .52, 63);
  const plotX = x + labelWidth;
  const plotW = w - labelWidth - 13;
  const rowH = Math.min(8.5, (h - 10) / items.length);
  const max = Math.max(...items.map((item) => item.value), 1);
  items.forEach((item, index) => {
    const top = y + 10 + index * rowH;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.9); doc.setTextColor(...INK);
    const label = doc.splitTextToSize(text(item.label), labelWidth - 2)[0] || "-";
    doc.text(label, x, top + 3.7);
    doc.setFillColor(230, 236, 242); doc.rect(plotX, top, plotW, 4.5, "F");
    doc.setFillColor(...(options.color ?? BLUE)); doc.rect(plotX, top, plotW * item.value / max, 4.5, "F");
    const value = options.showPercent === false ? fmtNumber(item.value) : `${fmtNumber(item.value)} (${fmtPct(item.percentage)})`;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.6); doc.setTextColor(...INK); doc.text(value, x + w, top + 3.7, { align: "right" });
  });
}

function drawGroupedBars(
  doc: jsPDF,
  rows: Array<{ label: string; values: number[]; stats?: DistributionStats }>,
  series: Array<{ label: string; color: [number, number, number] }>,
  x: number, y: number, w: number, h: number, title: string, subtitle: string,
  options: { showValues?: boolean; headroom?: number; valueFormatter?: (value: number, row: { label: string; values: number[]; stats?: DistributionStats }) => string } = {},
) {
  chartTitle(doc, title, subtitle, x, y);
  if (!rows.length || !rows.some((row) => row.values.some(Boolean))) { emptyChart(doc, x, y + 7, w, h - 7); return; }
  const plotY = y + 12;
  const plotH = h - 23;
  const rawMax = Math.max(...rows.flatMap((row) => row.values), 1);
  const max = rawMax * (options.headroom ?? 1);
  const groupW = (w - 12) / rows.length;
  const barW = Math.min(8, groupW / (series.length + .8));
  [0, .5, 1].forEach((ratio) => {
    const gy = plotY + plotH * (1 - ratio);
    doc.setDrawColor(226, 233, 239); doc.line(x + 8, gy, x + w, gy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...GREY); doc.text(String(Math.round(max * ratio)), x + 6, gy + 1.6, { align: "right" });
  });
  rows.forEach((row, rowIndex) => {
    const center = x + 9 + groupW * rowIndex + groupW / 2;
    row.values.forEach((value, seriesIndex) => {
      const bh = plotH * value / max;
      const barX = center - (series.length * barW) / 2 + seriesIndex * barW;
      doc.setFillColor(...series[seriesIndex].color); doc.rect(barX, plotY + plotH - bh, barW - 1, bh, "F");
      if (options.showValues) {
        const label = options.valueFormatter?.(value, row) ?? fmtNumber(value);
        doc.setFont("helvetica", "bold"); doc.setFontSize(5.7); doc.setTextColor(...INK);
        doc.text(text(label), barX + (barW - 1) / 2, Math.max(plotY + 3, plotY + plotH - bh - 1.6), { align: "center" });
      }
    });
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...GREY);
    doc.text(doc.splitTextToSize(text(row.label), groupW - 1)[0] || "", center, plotY + plotH + 5, { align: "center" });
  });
  let legendX = x + w;
  [...series].reverse().forEach((item) => {
    const tw = doc.getTextWidth(item.label) + 8; legendX -= tw;
    doc.setFillColor(...item.color); doc.rect(legendX, y + 1, 3, 3, "F");
    doc.setFontSize(6.2); doc.setTextColor(...GREY); doc.text(item.label, legendX + 4.5, y + 3.1);
  });
}

function drawFlowChart(doc: jsPDF, model: ReportModel, x: number, y: number, w: number, h: number) {
  chartTitle(doc, "Evolução do fluxo", "Barras: recebidos e enviados. Linha: estoque ao final de cada intervalo.", x, y);
  if (!model.trend.length) { emptyChart(doc, x, y + 7, w, h - 7); return; }
  const stockStayedZero = model.trend.every((point) => point.stock === 0);
  const plotY = y + 15; const plotH = h - (stockStayedZero ? 32 : 27); const plotX = x + 10; const plotW = w - 12;
  const rawMax = Math.max(...model.trend.flatMap((point) => [point.received, point.sent, point.stock]), 1);
  const max = rawMax * 1.22;
  const groupW = plotW / model.trend.length; const barW = Math.min(4, groupW / 3);
  [0, .5, 1].forEach((ratio) => { const gy = plotY + plotH * (1 - ratio); doc.setDrawColor(226, 233, 239); doc.line(plotX, gy, plotX + plotW, gy); doc.setFontSize(5.8); doc.setTextColor(...GREY); doc.text(String(Math.round(rawMax * ratio)), plotX - 2, gy + 1.5, { align: "right" }); });
  const stockPoints: Array<{ x: number; y: number; value: number; receivedLabelY: number; sentLabelY: number }> = [];
  let previous: { x: number; y: number } | null = null;
  model.trend.forEach((point, index) => {
    const center = plotX + groupW * index + groupW / 2;
    const receivedH = point.received / max * plotH; const sentH = point.sent / max * plotH;
    doc.setFillColor(...BLUE_LIGHT); doc.rect(center - barW - .5, plotY + plotH - receivedH, barW, receivedH, "F");
    doc.setFillColor(...BLUE); doc.rect(center + .5, plotY + plotH - sentH, barW, sentH, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.4); doc.setTextColor(...INK);
    const receivedLabelY = Math.max(plotY + 3, plotY + plotH - receivedH - 1.6);
    const sentLabelY = Math.max(plotY + 7, plotY + plotH - sentH - 1.6);
    doc.text(fmtNumber(point.received), center - barW / 2 - .5, receivedLabelY, { align: "center" });
    doc.text(fmtNumber(point.sent), center + barW / 2 + .5, sentLabelY, { align: "center" });
    const stockPoint = { x: center, y: plotY + plotH - point.stock / max * plotH };
    if (previous) { doc.setDrawColor(...GOLD); doc.setLineWidth(.7); doc.line(previous.x, previous.y, stockPoint.x, stockPoint.y); }
    doc.setFillColor(...GOLD); doc.circle(stockPoint.x, stockPoint.y, 1.1, "F"); previous = stockPoint;
    stockPoints.push({ ...stockPoint, value: point.stock, receivedLabelY, sentLabelY });
    if (model.trend.length <= 16 || index % Math.ceil(model.trend.length / 12) === 0) { doc.setFont("helvetica", "normal"); doc.setFontSize(5.7); doc.setTextColor(...GREY); doc.text(text(point.label), center, plotY + plotH + 5, { align: "center", angle: model.trend.length > 12 ? 35 : 0 }); }
  });
  if (!stockStayedZero) {
    stockPoints.forEach((point, index) => {
      const label = fmtNumber(point.value);
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
      const labelW = Math.max(7.5, doc.getTextWidth(label) + 4);
      const labelH = 5.8;
      let labelY = point.y - labelH - 3.2 - (model.trend.length > 16 && index % 2 ? 6.2 : 0);
      const barCollision = [point.receivedLabelY, point.sentLabelY].some((barY) => Math.abs((labelY + labelH / 2) - barY) < 4.8);
      if (barCollision) labelY -= 6.2;
      labelY = Math.max(plotY + 1.2, labelY);
      doc.setFillColor(255, 255, 255); doc.setDrawColor(...GOLD); doc.setLineWidth(.35);
      doc.roundedRect(point.x - labelW / 2, labelY, labelW, labelH, 1.2, 1.2, "FD");
      doc.setTextColor(...INK); doc.text(label, point.x, labelY + 4, { align: "center" });
    });
  }
  const legend = [["Recebidos", BLUE_LIGHT], ["Enviados", BLUE], ["Estoque final", GOLD]] as const;
  let lx = x + w - 65; legend.forEach(([label, color]) => { doc.setFillColor(...color); doc.rect(lx, y + 1, 3, 3, "F"); doc.setFontSize(5.8); doc.setTextColor(...GREY); doc.text(label, lx + 4, y + 3.1); lx += doc.getTextWidth(label) + 10; });
  if (stockStayedZero) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.7); doc.setTextColor(...GREEN);
    doc.text("O estoque permaneceu zerado durante todo o período.", x, y + h - 1);
  }
}

function drawStackedDeadlines(doc: jsPDF, users: UserReportMetrics[], x: number, y: number, w: number, h: number) {
  chartTitle(doc, "Situação dos prazos por usuário", "Categorias separadas entre concluídos e pendentes; sem prazo não integra a barra.", x, y);
  if (!users.length) { emptyChart(doc, x, y + 7, w, h - 7); return; }
  const series = [
    ["Concl. no prazo", "completedOnTime", GREEN], ["Concl. com atraso", "completedLate", RED], ["Pend. no prazo", "pendingOnTime", BLUE],
    ["Próx. vencimento", "pendingNear", GOLD], ["Vencidos", "pendingOverdue", [145, 36, 36] as [number, number, number]],
  ] as const;
  const plotX = x + 34; const plotY = y + 13; const rowH = Math.min(9, (h - 20) / users.length); const plotW = w - 36;
  const max = Math.max(...users.map((user) => series.reduce((sum, [, key]) => sum + user.deadline[key], 0)), 1);
  users.forEach((user, index) => {
    const top = plotY + index * rowH;
    doc.setFontSize(6.2); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(text(user.name), 30)[0] || "", x, top + 4);
    let cursor = plotX;
    series.forEach(([, key, color]) => { const width = plotW * user.deadline[key] / max; doc.setFillColor(...color); doc.rect(cursor, top, width, 5, "F"); cursor += width; });
  });
  let lx = x; series.forEach(([label, , color], index) => { if (index === 3) lx = x + w / 2; const ly = y + h - (index >= 3 ? 2 : 6); doc.setFillColor(...color); doc.rect(lx, ly - 2.5, 2.5, 2.5, "F"); doc.setFontSize(5.3); doc.setTextColor(...GREY); doc.text(label, lx + 3.5, ly); lx += doc.getTextWidth(label) + 8; });
  const noDeadline = users.reduce((sum, user) => sum + user.deadline.noDeadline, 0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); doc.setTextColor(...GREY);
  doc.text(`Sem prazo aplicável: ${noDeadline}`, x + w, y + 4, { align: "right" });
}

function drawTransitChart(doc: jsPDF, users: UserReportMetrics[], x: number, y: number, w: number, h: number) {
  chartTitle(doc, "Tempo de tramitação", "Horas úteis normalizadas; métricas coincidentes possuem rótulo consolidado.", x, y);
  const measuredUsers = users.filter((user) => user.transit.count);
  if (!measuredUsers.length) { emptyChart(doc, x, y + 7, w, h - 7, "Não há medições suficientes"); return; }
  const series = [
    { label: "Mediana", color: GREEN, value: (user: UserReportMetrics) => user.transit.median ?? 0 },
    { label: "P75", color: BLUE, value: (user: UserReportMetrics) => user.transit.p75 ?? 0 },
    { label: "P90", color: GOLD, value: (user: UserReportMetrics) => user.transit.p90 ?? 0 },
  ];
  const plotY = y + 13; const plotH = h - 25; const plotX = x + 9; const plotW = w - 10;
  const rawMax = Math.max(...measuredUsers.flatMap((user) => series.map((item) => item.value(user))), 1);
  const max = rawMax * 1.15;
  const groupW = plotW / measuredUsers.length;
  const barW = Math.min(8, groupW / 4.1);
  [0, .5, 1].forEach((ratio) => {
    const gy = plotY + plotH * (1 - ratio);
    doc.setDrawColor(226, 233, 239); doc.line(plotX, gy, plotX + plotW, gy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...GREY);
    doc.text(String(Math.round(max * ratio)), plotX - 2, gy + 1.6, { align: "right" });
  });
  measuredUsers.forEach((user, userIndex) => {
    const center = plotX + groupW * userIndex + groupW / 2;
    const metrics = series.map((item, seriesIndex) => ({ ...item, seriesIndex, numeric: item.value(user) }));
    metrics.forEach((metric) => {
      const barX = center - (series.length * barW) / 2 + metric.seriesIndex * barW;
      const barH = plotH * metric.numeric / max;
      doc.setFillColor(...metric.color); doc.rect(barX, plotY + plotH - barH, barW - 1, barH, "F");
    });
    const coincident = new Map<string, typeof metrics>();
    metrics.forEach((metric) => {
      const key = metric.numeric.toFixed(1);
      coincident.set(key, [...(coincident.get(key) ?? []), metric]);
    });
    const labels = [...coincident.values()].map((items) => {
      const numeric = items[0].numeric;
      const names = items.map((item) => item.label).join("/");
      const barCenters = items.map((item) => center - (series.length * barW) / 2 + item.seriesIndex * barW + (barW - 1) / 2);
      const label = `${names}: ${formatChartDuration(numeric, user.transit)}`;
      doc.setFont("helvetica", "bold"); doc.setFontSize(5.15);
      const lines = doc.splitTextToSize(text(label), Math.max(24, groupW - 3)).slice(0, 2);
      const height = 1.7 + lines.length * 2.8;
      const pointY = plotY + plotH - numeric / max * plotH;
      return { lines, height, pointY, anchorX: barCenters.reduce((sum, value) => sum + value, 0) / barCenters.length };
    }).sort((a, b) => b.pointY - a.pointY);
    let lowerLabelTop = plotY + plotH + 1;
    labels.forEach((label) => {
      let top = label.pointY - label.height - 1.4;
      top = Math.min(top, lowerLabelTop - label.height - 1);
      top = Math.max(plotY + .8, top);
      const labelW = Math.max(24, groupW - 3);
      doc.setFillColor(255, 255, 255); doc.setDrawColor(219, 227, 234); doc.setLineWidth(.2);
      doc.roundedRect(label.anchorX - labelW / 2, top, labelW, label.height, .8, .8, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(5.15); doc.setTextColor(...INK);
      doc.text(label.lines, label.anchorX, top + 3.1, { align: "center" });
      lowerLabelTop = top;
    });
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.6); doc.setTextColor(...GREY);
    doc.text(doc.splitTextToSize(text(user.name), groupW - 2)[0] || "", center, plotY + plotH + 5, { align: "center" });
  });
  let legendX = x + w;
  [...series].reverse().forEach((item) => {
    const width = doc.getTextWidth(item.label) + 8; legendX -= width;
    doc.setFillColor(...item.color); doc.rect(legendX, y + 1, 3, 3, "F");
    doc.setFontSize(6.2); doc.setTextColor(...GREY); doc.text(item.label, legendX + 4.5, y + 3.1);
  });
}

function drawIndividualTransitCards(doc: jsPDF, user: UserReportMetrics | undefined, x: number, y: number, w: number, h: number) {
  chartTitle(doc, "Tempo de tramitação", "Visão individual em horas úteis; valores sem horário completo são aproximados.", x, y);
  if (!user || !user.transit.count) { emptyChart(doc, x, y + 8, w, h - 8, "Não há medições suficientes"); return; }
  const metrics = [
    ["Mediana", user.transit.median, GREEN], ["P75", user.transit.p75, BLUE], ["P90", user.transit.p90, GOLD],
    ["Média", user.transit.mean, BLUE_LIGHT], ["Menor", user.transit.min, GREEN], ["Maior", user.transit.max, RED],
  ] as Array<[string, number | null, [number, number, number]]>;
  const gap = 3; const cardW = (w - gap * 2) / 3; const cardH = (h - 15 - gap) / 2;
  metrics.forEach(([label, value, tone], index) => {
    const cx = x + (index % 3) * (cardW + gap); const cy = y + 11 + Math.floor(index / 3) * (cardH + gap);
    drawCard(doc, cx, cy, cardW, cardH, label, formatDuration(value, user.transit), value && value > WORKDAY_HOURS ? `${durationNumber(value)} horas úteis` : "", tone);
  });
}

class PdfBuilder {
  doc: jsPDF;
  generatedAt: Date;
  filters: string[];
  constructor(generatedAt: Date, filters: string[]) { this.doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }); this.generatedAt = generatedAt; this.filters = filters; }
  addPage(orientation: "portrait" | "landscape" = "portrait") { this.doc.addPage("a4", orientation); }
  header(title: string, subtitle: string, compact = false) {
    const width = this.doc.internal.pageSize.getWidth(); const height = compact ? 19 : 28;
    this.doc.setFillColor(...INK); this.doc.rect(0, 0, width, height, "F"); this.doc.setFillColor(...GOLD); this.doc.rect(0, height, width, 1.1, "F");
    this.doc.setTextColor(255, 255, 255); this.doc.setFont("helvetica", "bold"); this.doc.setFontSize(compact ? 12 : 16); this.doc.text(text(title), 14, compact ? 9 : 12);
    this.doc.setFont("helvetica", "normal"); this.doc.setFontSize(compact ? 6.5 : 8); this.doc.text(text(subtitle), 14, compact ? 14 : 19);
  }
  section(title: string, subtitle: string, y: number) {
    this.doc.setFont("helvetica", "bold"); this.doc.setFontSize(13); this.doc.setTextColor(...INK); this.doc.text(text(title), 14, y);
    this.doc.setFont("helvetica", "normal"); this.doc.setFontSize(7.5); this.doc.setTextColor(...GREY); this.doc.text(text(subtitle), 14, y + 5);
  }
  finish() {
    const pages = this.doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      this.doc.setPage(page); const width = this.doc.internal.pageSize.getWidth(); const height = this.doc.internal.pageSize.getHeight();
      this.doc.setDrawColor(217, 226, 236); this.doc.line(14, height - 13, width - 14, height - 13);
      this.doc.setFont("helvetica", "normal"); this.doc.setFontSize(6.5); this.doc.setTextColor(...GREY);
      this.doc.text(disclaimer, 14, height - 8);
      this.doc.text(`Práxis Web ${PRAXIS_VERSION} | ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(this.generatedAt)} | Página ${page} de ${pages}`, width - 14, height - 8, { align: "right" });
    }
  }
}

function drawCard(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, helper = "", tone: [number, number, number] = BLUE) {
  roundedRect(doc, x, y, w, h, [249, 251, 253], [220, 228, 235]);
  doc.setFillColor(...tone); doc.rect(x, y, 2, h, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.4); doc.setTextColor(...GREY); doc.text(text(label).toUpperCase(), x + 5, y + 6);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  const available = w - 10; const measured = doc.getTextWidth(text(value));
  if (measured > available) doc.setFontSize(Math.max(7.5, 13 * available / measured));
  doc.setTextColor(...INK); doc.text(text(value), x + 5, y + 14);
  if (helper) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.7); doc.setTextColor(...GREY);
    const helperLines = doc.splitTextToSize(text(helper), w - 9).slice(0, 2);
    doc.text(helperLines, x + 5, y + h - (helperLines.length > 1 ? 6.1 : 3.5));
  }
}

function drawScopeBand(doc: jsPDF, model: ReportModel, members: TeamMember[], y: number, width = 182) {
  roundedRect(doc, 14, y, width, 11, [244, 248, 251], [218, 228, 235]);
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.4); doc.setTextColor(...INK);
  doc.text(text(scopeText(model, members)), 18, y + 7);
}

function executivePage(builder: PdfBuilder, model: ReportModel, members: TeamMember[], mode: Exclude<ReportMode, "highlights">) {
  const doc = builder.doc;
  builder.header(mode === "complete" ? "PRÁXIS - RELATÓRIO COMPLETO" : "PRÁXIS - RELATÓRIO EXECUTIVO", `${fmtDate(model.filters.startDate)} a ${fmtDate(model.filters.endDate)} | Resumo executivo`);
  drawScopeBand(doc, model, members, 32);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.4); doc.setTextColor(...INK); doc.text("Síntese executiva", 14, 50);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.2); doc.setTextColor(55, 75, 92); const summary = doc.splitTextToSize(text(model.synthesis), 182); doc.text(summary, 14, 56);
  const startY = Math.max(72, 57 + summary.length * 4.2); const gap = 3; const cardW = (182 - gap * 2) / 3; const cardH = 22;
  const cards = [
    ["Estoque inicial", fmtNumber(model.flow.initialStock), "Pendentes antes do início", BLUE],
    ["Recebidos", fmtNumber(model.flow.received), "Entradas no período", BLUE_LIGHT],
    ["Enviados", fmtNumber(model.flow.sent), "Envios no período", GREEN],
    ["Estoque final", fmtNumber(model.flow.finalStock), "Inicial + recebidos - enviados", INK],
    ["Pendentes no prazo", fmtNumber(model.deadline.pendingOnTime), "Fora da faixa de alerta", GREEN],
    ["Próximos do vencimento", fmtNumber(model.deadline.pendingNear), `Até ${model.filters.nearDueDays ?? 3} dias`, GOLD],
    ["Pendentes vencidos", fmtNumber(model.deadline.pendingOverdue), "Prazo anterior ao fim do período", RED],
    ["Sem prazo aplicável", fmtNumber(model.deadline.noDeadline), "Fora dos denominadores", GREY],
    ["Concluídos no prazo", deadlineRate(model.deadline.completionCompliance), deadlineBase(model.deadline.completedOnTime, model.deadline.completedApplicable), GREEN],
    ["Mediana de tramitação", formatDuration(model.transit.median, model.transit), model.transit.count ? `${model.transit.count} ${pluralize(model.transit.count, "medição", "medições")}` : "Sem medições suficientes", BLUE],
    ["Relevância social", fmtNumber(model.highlights.socialTotal), "Processos distintos", GOLD],
    ["Alta complexidade", fmtNumber(model.highlights.complexTotal), "Processos distintos", INK],
    ["Enviados / recebidos", fmtPct(model.flow.sentReceivedRatio), "Razão do fluxo no período", BLUE],
  ] as Array<[string, string, string, [number, number, number]]>;
  cards.forEach((card, index) => drawCard(doc, 14 + (index % 3) * (cardW + gap), startY + Math.floor(index / 3) * (cardH + gap), cardW, cardH, ...card));
  const chartY = startY + 5 * (cardH + gap) + 1;
  const totalDeadlineStatuses = model.deadline.applicable + model.deadline.noDeadline;
  const deadlineData: CategoryMetric[] = [
    { label: "Concluídos no prazo", value: model.deadline.completedOnTime, percentage: totalDeadlineStatuses ? model.deadline.completedOnTime / totalDeadlineStatuses * 100 : 0 },
    { label: "Concluídos com atraso", value: model.deadline.completedLate, percentage: totalDeadlineStatuses ? model.deadline.completedLate / totalDeadlineStatuses * 100 : 0 },
    { label: "Pendentes no prazo", value: model.deadline.pendingOnTime, percentage: totalDeadlineStatuses ? model.deadline.pendingOnTime / totalDeadlineStatuses * 100 : 0 },
    { label: "Próximos do vencimento", value: model.deadline.pendingNear, percentage: totalDeadlineStatuses ? model.deadline.pendingNear / totalDeadlineStatuses * 100 : 0 },
    { label: "Pendentes vencidos", value: model.deadline.pendingOverdue, percentage: totalDeadlineStatuses ? model.deadline.pendingOverdue / totalDeadlineStatuses * 100 : 0 },
    { label: "Sem prazo aplicável", value: model.deadline.noDeadline, percentage: totalDeadlineStatuses ? model.deadline.noDeadline / totalDeadlineStatuses * 100 : 0 },
  ];
  const conformity = model.deadline.currentConformity == null
    ? "Não aplicável - nenhum processo com prazo"
    : `Conformidade: ${fmtPct(model.deadline.currentConformity)} | Base: ${model.deadline.applicable} com prazo aplicável`;
  drawHorizontalBars(doc, deadlineData, 14, chartY, 88, 64, { title: "Situação dos prazos", subtitle: conformity, maxItems: 6 });
  const highlightData: CategoryMetric[] = [
    { label: "Somente relevância social", value: model.highlights.socialOnly, percentage: model.highlights.total ? model.highlights.socialOnly / model.highlights.total * 100 : 0 },
    { label: "Somente alta complexidade", value: model.highlights.complexOnly, percentage: model.highlights.total ? model.highlights.complexOnly / model.highlights.total * 100 : 0 },
    { label: "Ambas as classificações", value: model.highlights.both, percentage: model.highlights.total ? model.highlights.both / model.highlights.total * 100 : 0 },
  ];
  const highlightSubtitle = model.highlights.total
    ? `${model.highlights.total} ${pluralize(model.highlights.total, "processo distinto", "processos distintos")}`
    : "Nenhum processo destacado";
  if (model.highlights.total) drawHorizontalBars(doc, highlightData, 108, chartY, 88, 64, { title: "Processos destacados", subtitle: highlightSubtitle, color: GOLD, maxItems: 3 });
  else { chartTitle(doc, "Processos destacados", highlightSubtitle, 108, chartY); emptyChart(doc, 108, chartY + 8, 88, 56, "Nenhum processo destacado"); }
}

function flowAndProductivityPage(builder: PdfBuilder, model: ReportModel) {
  builder.addPage("landscape"); builder.header("FLUXO E PRODUTIVIDADE", `${fmtDate(model.filters.startDate)} a ${fmtDate(model.filters.endDate)}`, true);
  const doc = builder.doc; drawFlowChart(doc, model, 14, 29, 269, 72);
  drawHorizontalBars(doc, model.actions, 14, 110, 130, 68, { title: "Providências adotadas", subtitle: "Quantidade e participação no total filtrado", maxItems: 8 });
  drawHorizontalBars(doc, model.classes, 153, 110, 130, 68, { title: "Classes processuais", subtitle: "Principais classes no período e estoque", color: GREEN, maxItems: 8 });
}

function teamComparisonPage(builder: PdfBuilder, model: ReportModel) {
  builder.addPage("landscape"); builder.header("COMPARATIVO POR USUÁRIO", "Fluxo, estoque e prazos - sem ranking competitivo", true);
  const doc = builder.doc;
  drawGroupedBars(
    doc,
    model.users.map((user) => ({ label: user.name, values: [user.received, user.sent] })),
    [{ label: "Recebidos", color: BLUE_LIGHT }, { label: "Enviados", color: BLUE }],
    14, 29, 269, 72,
    "Recebidos e enviados",
    "Pendentes e estoque aparecem na tabela, em escala própria.",
    { showValues: true, headroom: 1.15 },
  );
  autoTable(doc, {
    startY: 108, margin: { left: 14, right: 14, bottom: 18 },
    head: [["Usuário", "Estoque inicial", "Recebidos", "Enviados", "Saldo", "Estoque final", "Concl. prazo", "Sem prazo", "Pendentes", "Mediana"]],
    body: model.users.map((user) => [
      text(user.name), user.initialStock, user.received, user.sent, user.balance, user.finalStock,
      user.deadline.completedApplicable ? `${user.deadline.completedOnTime}/${user.deadline.completedApplicable}` : "Não aplicável",
      user.deadline.noDeadline, user.finalStock, formatDuration(user.transit.median, user.transit),
    ]),
    theme: "grid", styles: { fontSize: 6.6, cellPadding: 1.6, overflow: "linebreak" }, headStyles: { fillColor: INK }, alternateRowStyles: { fillColor: [247, 249, 251] },
  });
}

function deadlinesAndTransitPage(builder: PdfBuilder, model: ReportModel, includeTeam: boolean) {
  builder.addPage("landscape"); builder.header("PRAZOS E TEMPO DE TRAMITAÇÃO", "Horas úteis calculadas pela regra central do Práxis", true);
  const doc = builder.doc;
  if (includeTeam) { drawStackedDeadlines(doc, model.users, 14, 29, 130, 72); drawTransitChart(doc, model.users, 153, 29, 130, 72); }
  else { drawStackedDeadlines(doc, model.users, 14, 29, 130, 72); drawIndividualTransitCards(doc, model.users[0], 153, 29, 130, 72); }
  autoTable(doc, {
    startY: 109, margin: { left: 14, right: 14, bottom: 18 },
    head: [["Usuário", "Medições", "Sem prazo", "Média", "Mediana", "P75", "P90", "Menor", "Maior", "Mesmo dia", "Até 1 dia útil", "Até 3 dias úteis"]],
    body: model.users.map((user) => {
      const base = user.transit.count;
      return [
        text(user.name), base, user.deadline.noDeadline,
        formatDuration(user.transit.mean, user.transit), formatDuration(user.transit.median, user.transit), formatDuration(user.transit.p75, user.transit), formatDuration(user.transit.p90, user.transit), formatDuration(user.transit.min, user.transit), formatDuration(user.transit.max, user.transit),
        fmtPct(base ? user.transit.sameBusinessDay / base * 100 : null), fmtPct(base ? user.transit.withinOneBusinessDay / base * 100 : null), fmtPct(base ? user.transit.withinThreeBusinessDays / base * 100 : null),
      ];
    }),
    theme: "grid", styles: { fontSize: 6.1, cellPadding: 1.45, overflow: "linebreak" }, headStyles: { fillColor: INK }, alternateRowStyles: { fillColor: [247, 249, 251] },
  });
  const finalY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 140) + 7;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GREY);
  doc.text(`A jornada útil adotada é de ${WORKDAY_HOURS} horas. "Mesmo dia útil" representa duração calculada igual a zero em envio ocorrido na mesma data; quando faltam horários completos, não é uma duração exata.`, 14, Math.min(finalY, 190));
}

function profilePage(builder: PdfBuilder, model: ReportModel) {
  builder.addPage("portrait"); builder.header("PERFIL DA ATUAÇÃO", "ODS, classes processuais e processos destacados", true);
  const doc = builder.doc;
  drawHorizontalBars(doc, model.relevance.sdgs, 14, 29, 182, 92, { title: "Objetivos de Desenvolvimento Sustentável", subtitle: "Cada ODS é contado individualmente; percentual sobre processos socialmente relevantes", color: GOLD, maxItems: 11 });
  drawHorizontalBars(doc, model.classes, 14, 130, 182, 69, { title: "Classes processuais", subtitle: "Quantidade e percentual no conjunto filtrado", color: GREEN, maxItems: 8 });
  const exclusive: CategoryMetric[] = [
    { label: "Somente relevância social", value: model.highlights.socialOnly, percentage: model.highlights.total ? model.highlights.socialOnly / model.highlights.total * 100 : 0 },
    { label: "Somente alta complexidade", value: model.highlights.complexOnly, percentage: model.highlights.total ? model.highlights.complexOnly / model.highlights.total * 100 : 0 },
    { label: "Ambas as classificações", value: model.highlights.both, percentage: model.highlights.total ? model.highlights.both / model.highlights.total * 100 : 0 },
  ];
  if (model.highlights.total) {
    drawHorizontalBars(doc, exclusive, 14, 208, 182, 62, {
      title: "Categorias exclusivas de destaque",
      subtitle: `Totais: relevância social ${model.highlights.socialTotal}; alta complexidade ${model.highlights.complexTotal}; ${model.highlights.total} ${pluralize(model.highlights.total, "processo destacado", "processos destacados")}`,
      color: GOLD, maxItems: 3,
    });
  } else {
    chartTitle(doc, "Categorias exclusivas de destaque", "Nenhum processo destacado", 14, 208);
    emptyChart(doc, 14, 216, 182, 54, "Nenhum processo destacado para os filtros aplicados");
  }
}

function drawInsightCard(doc: jsPDF, x: number, y: number, w: number, h: number, title: string, headline: string, explanation: string, tone: [number, number, number]) {
  chartTitle(doc, title, "Síntese adequada à distribuição encontrada", x, y);
  roundedRect(doc, x, y + 8, w, h - 8, [249, 251, 253], [220, 228, 235]);
  doc.setFillColor(...tone); doc.rect(x, y + 8, 2, h - 8, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(text(headline), w - 12), x + 7, y + 21);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GREY);
  doc.text(doc.splitTextToSize(text(explanation), w - 12), x + 7, y + 31);
}

function drawDimension(
  doc: jsPDF,
  data: CategoryMetric[],
  x: number, y: number, w: number, h: number,
  options: { title: string; subtitle: string; color: [number, number, number]; maxItems?: number; freeText?: boolean },
) {
  const presentation = categoryPresentation(data, options.freeText);
  if (presentation === "empty") { chartTitle(doc, options.title, options.subtitle, x, y); emptyChart(doc, x, y + 8, w, h - 8); return; }
  if (presentation === "single") {
    const item = data[0];
    drawInsightCard(doc, x, y, w, h, options.title, `${item.label}: ${item.value} ${pluralize(item.value, "processo", "processos")} - 100%`, "A dimensão não apresentou variação no período.", options.color);
    return;
  }
  if (presentation === "insight") {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    drawInsightCard(
      doc, x, y, w, h, options.title,
      `${data.length} ${pluralize(data.length, "categoria cadastrada", "categorias cadastradas")}`,
      `Foram encontradas ${total} ocorrências, mas não há repetição suficiente em pelo menos duas categorias para gerar ranking significativo. Os textos completos permanecem no anexo.`,
      options.color,
    );
    return;
  }
  drawHorizontalBars(doc, data, x, y, w, h, options);
}

function relevanceProfilePage(builder: PdfBuilder, model: ReportModel) {
  builder.addPage("landscape"); builder.header("PERFIL DA RELEVÂNCIA SOCIAL", "Distribuições calculadas sobre processos socialmente relevantes", true);
  const doc = builder.doc;
  if (!model.highlights.socialTotal) {
    emptyChart(doc, 14, 35, 269, 70, "Não há processos socialmente relevantes para os filtros aplicados");
    return;
  }
  const w = 84; const h = 71; const xs = [14, 106.5, 199];
  drawDimension(doc, model.relevance.reach, xs[0], 29, w, h, { title: "Alcance", subtitle: "Individual qualificado, coletivo, difuso ou estrutural", color: GREEN, maxItems: 5 });
  drawDimension(doc, model.relevance.territory, xs[1], 29, w, h, { title: "Abrangência territorial", subtitle: "Do âmbito local ao nacional", color: BLUE, maxItems: 5 });
  drawDimension(doc, model.relevance.impact, xs[2], 29, w, h, { title: "Tipo de impacto", subtitle: "Direto, indireto ou reflexo", color: GOLD, maxItems: 5 });
  drawDimension(doc, model.relevance.rights, xs[0], 108, w, h, { title: "Direitos fundamentais", subtitle: "Principais direitos identificados", color: BLUE, maxItems: 6, freeText: true });
  drawDimension(doc, model.relevance.groups, xs[1], 108, w, h, { title: "Grupos afetados", subtitle: "Principais grupos identificados", color: GOLD, maxItems: 6, freeText: true });
  drawDimension(doc, model.relevance.themes, xs[2], 108, w, h, { title: "Temas sociais", subtitle: "Principais temas identificados", color: GREEN, maxItems: 6, freeText: true });
}

function balancedComparisonPage(builder: PdfBuilder, model: ReportModel) {
  builder.addPage("landscape"); builder.header("COMPARAÇÃO EQUILIBRADA DA EQUIPE", "Composição da carga e verificações de qualidade - sem ranking competitivo", true);
  const doc = builder.doc;
  autoTable(doc, {
    startY: 29, margin: { left: 14, right: 14, bottom: 18 },
    head: [["Usuário", "Comuns", "Relev. social", "Alta complex.", "Ambas", "% mesmo dia", "Qualidade", "Classes mais frequentes", "Providências mais frequentes"]],
    body: model.users.map((user) => [
      text(user.name), user.common, user.socialOnly, user.complexOnly, user.both,
      fmtPct(user.transit.count ? user.transit.sameBusinessDay / user.transit.count * 100 : null),
      user.qualityChecked ? `${user.qualityIssues} ${pluralize(user.qualityIssues, "apontamento", "apontamentos")} em ${user.qualityChecked}` : "-",
      text(shortList(user.classes)), text(shortList(user.actions)),
    ]),
    theme: "grid", styles: { fontSize: 6.1, cellPadding: 1.8, overflow: "linebreak", valign: "middle" }, headStyles: { fillColor: INK }, alternateRowStyles: { fillColor: [247, 249, 251] },
    columnStyles: { 0: { cellWidth: 30 }, 7: { cellWidth: 57 }, 8: { cellWidth: 57 } },
  });
  const y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 80) + 8;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...INK); doc.text("Nota de leitura", 14, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GREY);
  doc.text(doc.splitTextToSize("Rapidez, volume e complexidade descrevem dimensões diferentes do trabalho. Esta seção não produz classificação geral de desempenho. O Índice de Carga Qualificada não foi ativado nesta versão porque a estrutura atual ainda não possui pesos administrativos versionados; introduzi-lo com pesos fixos contrariaria a transparência metodológica solicitada.", 266), 14, y + 5);
}

function historicalComparisonPage(builder: PdfBuilder, current: ReportModel, previous: ReportModel) {
  builder.addPage("portrait"); builder.header("COMPARAÇÃO COM O ANO ANTERIOR", `${fmtDate(current.filters.startDate)} a ${fmtDate(current.filters.endDate)} versus ${fmtDate(previous.filters.startDate)} a ${fmtDate(previous.filters.endDate)}`, true);
  const doc = builder.doc;
  const variation = (value: number, prior: number) => prior ? `${value >= prior ? "+" : ""}${((value - prior) / prior * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : value ? "Novo" : "0,0%";
  autoTable(doc, {
    startY: 31, margin: { left: 14, right: 14, bottom: 18 },
    head: [["Indicador", "Período atual", "Período anterior", "Variação"]],
    body: [
      ["Estoque inicial", current.flow.initialStock, previous.flow.initialStock, variation(current.flow.initialStock, previous.flow.initialStock)],
      ["Recebidos", current.flow.received, previous.flow.received, variation(current.flow.received, previous.flow.received)],
      ["Enviados", current.flow.sent, previous.flow.sent, variation(current.flow.sent, previous.flow.sent)],
      ["Estoque final", current.flow.finalStock, previous.flow.finalStock, variation(current.flow.finalStock, previous.flow.finalStock)],
      ["Concluídos no prazo", deadlineRate(current.deadline.completionCompliance), deadlineRate(previous.deadline.completionCompliance), "-"],
      ["Mediana de tramitação", formatDuration(current.transit.median, current.transit), formatDuration(previous.transit.median, previous.transit), "-"],
      ["Relevância social", current.highlights.socialTotal, previous.highlights.socialTotal, variation(current.highlights.socialTotal, previous.highlights.socialTotal)],
      ["Alta complexidade", current.highlights.complexTotal, previous.highlights.complexTotal, variation(current.highlights.complexTotal, previous.highlights.complexTotal)],
    ],
    theme: "grid", styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: { fillColor: INK }, alternateRowStyles: { fillColor: [247, 249, 251] },
  });
  const y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 90) + 9;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GREY);
  const comparableUsers = Math.min(current.users.length, previous.users.length);
  doc.text(doc.splitTextToSize(`Equipe comparável: ${comparableUsers} ${pluralize(comparableUsers, "usuário com cobertura", "usuários com cobertura")} nos dois períodos. A comparação repete os mesmos filtros no intervalo equivalente do ano anterior. Estoque é reconstruído em cada data; portanto, a comparação não usa apenas recebidos menos enviados.`, 182), 14, y);
}

function notesPage(builder: PdfBuilder, model: ReportModel, members: TeamMember[]) {
  builder.addPage("portrait"); builder.header("NOTAS METODOLÓGICAS", "Definições usadas para interpretar o relatório", true);
  const doc = builder.doc; let y = 31;
  const scope = reportScopeInfo(model, members);
  const notes = [
    ["Período considerado", `${fmtDate(model.filters.startDate)} a ${fmtDate(model.filters.endDate)}, inclusive. Datas e cortes seguem o horário local da aplicação.`],
    ["Escopo", scope.kind === "individual" ? `Relatório individual. Responsável: ${scope.responsibleName}.` : `Relatório da equipe. Foram considerados ${scope.usersConsidered} ${pluralize(scope.usersConsidered, "usuário ativo", "usuários ativos")} no escopo selecionado.`],
    ["Cobertura histórica", `${model.coverage.available} de ${model.coverage.total} ${pluralize(model.coverage.total, "usuário possui", "usuários possuem")} dados disponíveis no período. Ausência de histórico não é preenchida com zero. Datas de início são confirmadas administrativamente e não inferidas do primeiro processo encontrado.`],
    ["Recebido", "Movimentação cuja data de entrada está dentro do período. Retornos do mesmo número processual são movimentações distintas para fins de fluxo."],
    ["Enviado", "Movimentação com status Enviado e data de envio dentro do período, mesmo que tenha sido recebida anteriormente."],
    ["Estoque", "Estoque inicial são os registros já pendentes antes do início. Estoque final = estoque inicial + recebidos - enviados. O saldo do período não é tratado isoladamente como estoque."],
    ["Horas úteis", `São reutilizadas as horas calculadas pela função central do Práxis: jornada de ${WORKDAY_HOURS} horas, exclusão de fins de semana, feriados e recessos cadastrados, além dos descontos já aplicados pelo sistema.`],
    ["Prazos", `Concluídos e pendentes são separados. Próximo do vencimento segue o alerta atual de ${model.filters.nearDueDays ?? 3} dias. A taxa entre concluídos e a conformidade atual usam apenas processos com prazo aplicável. Base atual: ${model.deadline.applicable} ${pluralize(model.deadline.applicable, "processo com prazo aplicável", "processos com prazo aplicável")}.`],
    ["Sem prazo aplicável", `${model.deadline.noDeadline} ${pluralize(model.deadline.noDeadline, "processo foi classificado", "processos foram classificados")} sem prazo aplicável. Esses registros não entram nos denominadores de cumprimento ou conformidade.`],
    ["Tempo de tramitação", "Média, mediana, percentis 75 e 90, mínimo e máximo usam horas úteis. Se o cálculo for zero e o recebimento e o envio ocorrerem na mesma data, o relatório exibe “Mesmo dia útil”. Em registros importados sem horário completo, essa expressão indica o intervalo do mesmo dia, não uma duração exata de zero hora."],
    ["ODS", "Um processo pode possuir vários Objetivos de Desenvolvimento Sustentável. Cada ODS é contado uma vez por processo e seu percentual usa como base o total de processos socialmente relevantes."],
    ["Responsabilidade", "Os cortes por usuário usam o responsável atualmente associado à movimentação. O Práxis ainda não mantém histórico temporal completo de redistribuições para reconstruir a responsabilidade em datas passadas."],
  ];
  notes.forEach(([title, body], index) => {
    const lines = doc.splitTextToSize(text(body), 139);
    const height = Math.max(18, 8 + lines.length * 3.5);
    if (y + height > 278) { builder.addPage("portrait"); builder.header("NOTAS METODOLÓGICAS", "Continuação", true); y = 31; }
    doc.setFillColor(index % 2 ? 249 : 244, index % 2 ? 251 : 248, index % 2 ? 253 : 251); doc.roundedRect(14, y, 182, height, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.7); doc.setTextColor(...INK); doc.text(text(title), 18, y + 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(...GREY); doc.text(lines, 52, y + 5);
    y += height + 2;
  });
  if (model.warnings.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...RED); doc.text("Alertas de consistência", 14, y + 3);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); model.warnings.forEach((warning, index) => doc.text(`- ${text(warning)}`, 18, y + 9 + index * 5));
  }
}

function annexMeta(record: ReportModel["highlightedProcesses"][number]): Array<[string, string]> {
  const fields: Array<[string, string]> = [
    ["Número", record.judicialNumber],
    ["Classe", record.className],
    ["Assunto", record.subject],
    ["Responsável", record.assignedName || "Não identificado"],
  ];
  if (record.sociallyRelevant) {
    fields.push(
      ["Tema social", record.socialTheme || "Não informado"],
      ["Alcance", record.reach || "Não informado"],
      ["Abrangência", record.territorialScope || "Não informada"],
      ["Impacto", record.impactType || "Não informado"],
      ["ODS", record.sdgs.join(", ") || "Não informado"],
    );
  }
  return fields;
}

function annexDetails(record: ReportModel["highlightedProcesses"][number]): Array<[string, string]> {
  const fields: Array<[string, string]> = [];
  if (record.sociallyRelevant) {
    if (record.fundamentalRight) fields.push(["Direito fundamental relacionado", record.fundamentalRight]);
    if (record.affectedGroup) fields.push(["Grupo afetado", record.affectedGroup]);
    if (record.relevanceReason) fields.push(["Justificativa da relevância social", record.relevanceReason]);
    if (record.socialResult) fields.push(["Impacto social esperado", record.socialResult]);
  }
  if (record.extremelyComplex && record.complexityReason) fields.push(["Justificativa da alta complexidade", record.complexityReason]);
  return fields;
}

interface AnnexMetaCell { label: string; lines: string[]; }
interface AnnexMetaRow { cells: AnnexMetaCell[]; height: number; }
interface AnnexDetailRow { label: string; lines: string[]; height: number; }
interface AnnexBlockLayout { metaRows: AnnexMetaRow[]; details: AnnexDetailRow[]; height: number; }

function processBlockLayout(doc: jsPDF, record: ReportModel["highlightedProcesses"][number]): AnnexBlockLayout {
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  const metaCells = annexMeta(record).map(([label, value]) => ({
    label,
    lines: doc.splitTextToSize(text(value), 82).slice(0, 2) as string[],
  }));
  const metaRows: AnnexMetaRow[] = [];
  for (let index = 0; index < metaCells.length; index += 2) {
    const cells = metaCells.slice(index, index + 2);
    const lineCount = Math.max(...cells.map((cell) => cell.lines.length), 1);
    metaRows.push({ cells, height: 6.1 + lineCount * 3.15 });
  }
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.6);
  const details = annexDetails(record).map(([label, value]) => {
    const lines = doc.splitTextToSize(text(value), 170) as string[];
    return { label, lines, height: 6 + Math.max(lines.length, 1) * 3.55 };
  });
  const contentHeight = 15 + metaRows.reduce((sum, row) => sum + row.height, 0) + (details.length ? 2 : 0)
    + details.reduce((sum, row) => sum + row.height, 0) + 4;
  return { metaRows, details, height: Math.max(48, contentHeight) };
}

function highlightedAnnex(builder: PdfBuilder, model: ReportModel) {
  const count = model.highlightedProcesses.length;
  builder.addPage("portrait"); builder.header(
    "ANEXO DE PROCESSOS DESTACADOS",
    count ? `${count} ${pluralize(count, "processo distinto", "processos distintos")}` : "Nenhum processo destacado",
    true,
  );
  const doc = builder.doc; let y = 29;
  if (!model.highlightedProcesses.length) { emptyChart(doc, 14, 35, 182, 45, "Nenhum processo destacado para os filtros aplicados"); return; }
  model.highlightedProcesses.forEach((record, index) => {
    const layout = processBlockLayout(doc, record); const height = layout.height; const pageHeight = doc.internal.pageSize.getHeight();
    const contentBottom = pageHeight - 19;
    if (y + height > contentBottom) { builder.addPage("portrait"); builder.header("ANEXO DE PROCESSOS DESTACADOS", `Continuação - registro ${index + 1} de ${model.highlightedProcesses.length}`, true); y = 29; }
    roundedRect(doc, 14, y, 182, height, [252, 253, 254], [205, 216, 225]);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(`Processo destacado ${index + 1} de ${model.highlightedProcesses.length}`, 18, y + 7);
    const tags = record.sociallyRelevant && record.extremelyComplex ? ["RELEVÂNCIA SOCIAL", "ALTA COMPLEXIDADE"] : [record.sociallyRelevant ? "RELEVÂNCIA SOCIAL" : "ALTA COMPLEXIDADE"];
    let tagX = 192; [...tags].reverse().forEach((tag) => { doc.setFont("helvetica", "bold"); doc.setFontSize(5.8); const width = doc.getTextWidth(tag) + 7; tagX -= width; doc.setDrawColor(...INK); doc.setFillColor(241, 245, 249); doc.roundedRect(tagX, y + 3, width, 6, 1.5, 1.5, "FD"); doc.setTextColor(...INK); doc.text(tag, tagX + 3.5, y + 7); tagX -= 2; });
    const cols = [18, 107];
    let contentY = y + 15;
    layout.metaRows.forEach((row) => {
      row.cells.forEach((cell, col) => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...GREY); doc.text(text(cell.label).toUpperCase(), cols[col], contentY);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...INK);
        doc.text(cell.lines, cols[col], contentY + 4.1, { lineHeightFactor: 1.15 });
      });
      contentY += row.height;
    });
    if (layout.details.length) contentY += 2;
    layout.details.forEach((detail) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.1); doc.setTextColor(...INK); doc.text(text(detail.label), 18, contentY);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.6); doc.setTextColor(55, 75, 92);
      doc.text(detail.lines, 18, contentY + 4.2, { lineHeightFactor: 1.15 });
      contentY += detail.height;
    });
    y += height + 5;
  });
}

function annexIdentificationPage(builder: PdfBuilder, model: ReportModel, members: TeamMember[]) {
  const doc = builder.doc;
  builder.header("PRÁXIS - ANEXO DE PROCESSOS DESTACADOS", `${fmtDate(model.filters.startDate)} a ${fmtDate(model.filters.endDate)}`);
  drawScopeBand(doc, model, members, 33);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...INK); doc.text("Identificação do anexo", 14, 57);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GREY);
  const count = model.highlightedProcesses.length;
  doc.text(
    doc.splitTextToSize(
      count
        ? `O anexo reúne ${count} ${pluralize(count, "processo destacado", "processos destacados")} conforme os filtros selecionados.`
        : "Nenhum processo destacado foi encontrado para os filtros selecionados.",
      182,
    ),
    14, 66,
  );
  roundedRect(doc, 14, 87, 182, 56, [247, 250, 252], [218, 228, 235]);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...INK); doc.text("Informações metodológicas mínimas", 19, 98);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GREY);
  const notes = [
    "São incluídos processos com relevância social, alta complexidade ou ambas as classificações.",
    "Os campos sociais só aparecem quando o processo possui relevância social.",
    "A justificativa da complexidade só aparece quando essa classificação está marcada.",
    "O responsável informado é o atualmente associado à movimentação; não há reconstrução retroativa por suposição.",
  ];
  notes.forEach((note, index) => doc.text(`- ${text(note)}`, 20, 108 + index * 8));
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...BLUE);
  doc.text(`Filtros: ${reportFilterDescription(model.filters, members).join(" | ")}`, 14, 158, { maxWidth: 182 });
}

export function generateManagementReportPdf(model: ReportModel, options: ReportPdfOptions): number[] {
  const generatedAt = options.generatedAt ?? new Date();
  const filters = reportFilterDescription(model.filters, options.members);
  const builder = new PdfBuilder(generatedAt, filters);
  const includeTeam = model.filters.scope === "team" && model.users.length > 1;
  if (options.mode === "highlights") {
    annexIdentificationPage(builder, model, options.members);
    highlightedAnnex(builder, model);
  } else {
    executivePage(builder, model, options.members, options.mode);
    if (options.comparisonModel) historicalComparisonPage(builder, options.comparisonCurrentModel ?? model, options.comparisonModel);
    flowAndProductivityPage(builder, model);
    if (includeTeam) teamComparisonPage(builder, model);
    deadlinesAndTransitPage(builder, model, includeTeam);
    profilePage(builder, model);
    relevanceProfilePage(builder, model);
    if (options.mode === "complete") {
      if (includeTeam) balancedComparisonPage(builder, model);
      highlightedAnnex(builder, model);
      notesPage(builder, model, options.members);
    }
  }
  builder.finish();
  return Array.from(new Uint8Array(builder.doc.output("arraybuffer")));
}
