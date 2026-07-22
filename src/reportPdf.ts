import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatElapsedTime } from "./date";
import { reportFilterDescription, type CategoryMetric, type ReportMode, type ReportModel, type UserReportMetrics, WORKDAY_HOURS } from "./reporting";
import type { TeamMember } from "./types";

const VERSION = "0.7.0";
const INK: [number, number, number] = [16, 42, 67];
const BLUE: [number, number, number] = [30, 96, 145];
const BLUE_LIGHT: [number, number, number] = [155, 187, 212];
const GREEN: [number, number, number] = [42, 137, 117];
const GOLD: [number, number, number] = [184, 138, 36];
const RED: [number, number, number] = [190, 66, 55];
const GREY: [number, number, number] = [98, 125, 152];
const LIGHT: [number, number, number] = [241, 245, 249];
const disclaimer = "Relatório gerencial auxiliar; não substitui os sistemas oficiais da Instituição.";

export interface ReportPdfOptions { mode: ReportMode; members: TeamMember[]; generatedAt?: Date; comparisonModel?: ReportModel; }

function text(value: unknown): string {
  return String(value ?? "").replace(/[—–]/g, "-").replace(/[“”]/g, '"').replace(/’/g, "'");
}

function fmtNumber(value: number): string { return value.toLocaleString("pt-BR"); }
function fmtPct(value: number | null): string { return value == null ? "-" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`; }
function fmtDate(value: string): string { return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`)); }
function shortList(items: Array<{ label: string; value: number }>, limit = 3): string { return items.slice(0, limit).map((item) => `${item.label} (${item.value})`).join(", ") || "-"; }

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
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(...GREY); doc.text(text(subtitle), x, y + 4);
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
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.6); doc.setTextColor(...INK);
    const label = doc.splitTextToSize(text(item.label), labelWidth - 2)[0] || "-";
    doc.text(label, x, top + 3.7);
    doc.setFillColor(230, 236, 242); doc.rect(plotX, top, plotW, 4.5, "F");
    doc.setFillColor(...(options.color ?? BLUE)); doc.rect(plotX, top, plotW * item.value / max, 4.5, "F");
    const value = options.showPercent === false ? fmtNumber(item.value) : `${fmtNumber(item.value)} (${fmtPct(item.percentage)})`;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.2); doc.setTextColor(...INK); doc.text(value, x + w, top + 3.7, { align: "right" });
  });
}

function drawGroupedBars(doc: jsPDF, rows: Array<{ label: string; values: number[] }>, series: Array<{ label: string; color: [number, number, number] }>, x: number, y: number, w: number, h: number, title: string, subtitle: string) {
  chartTitle(doc, title, subtitle, x, y);
  if (!rows.length || !rows.some((row) => row.values.some(Boolean))) { emptyChart(doc, x, y + 7, w, h - 7); return; }
  const plotY = y + 12;
  const plotH = h - 23;
  const max = Math.max(...rows.flatMap((row) => row.values), 1);
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
      doc.setFillColor(...series[seriesIndex].color); doc.rect(center - (series.length * barW) / 2 + seriesIndex * barW, plotY + plotH - bh, barW - 1, bh, "F");
    });
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.5); doc.setTextColor(...GREY);
    doc.text(doc.splitTextToSize(text(row.label), groupW - 1)[0] || "", center, plotY + plotH + 5, { align: "center" });
  });
  let legendX = x + w;
  [...series].reverse().forEach((item) => {
    const tw = doc.getTextWidth(item.label) + 8; legendX -= tw;
    doc.setFillColor(...item.color); doc.rect(legendX, y + 1, 3, 3, "F");
    doc.setFontSize(5.8); doc.setTextColor(...GREY); doc.text(item.label, legendX + 4.5, y + 3.1);
  });
}

function drawFlowChart(doc: jsPDF, model: ReportModel, x: number, y: number, w: number, h: number) {
  chartTitle(doc, "Evolução do fluxo", "Barras: recebidos e enviados. Linha: estoque ao final de cada intervalo.", x, y);
  if (!model.trend.length) { emptyChart(doc, x, y + 7, w, h - 7); return; }
  const plotY = y + 13; const plotH = h - 25; const plotX = x + 10; const plotW = w - 12;
  const max = Math.max(...model.trend.flatMap((point) => [point.received, point.sent, point.stock]), 1);
  const groupW = plotW / model.trend.length; const barW = Math.min(4, groupW / 3);
  [0, .5, 1].forEach((ratio) => { const gy = plotY + plotH * (1 - ratio); doc.setDrawColor(226, 233, 239); doc.line(plotX, gy, plotX + plotW, gy); doc.setFontSize(5.5); doc.setTextColor(...GREY); doc.text(String(Math.round(max * ratio)), plotX - 2, gy + 1.5, { align: "right" }); });
  let previous: { x: number; y: number } | null = null;
  model.trend.forEach((point, index) => {
    const center = plotX + groupW * index + groupW / 2;
    const receivedH = point.received / max * plotH; const sentH = point.sent / max * plotH;
    doc.setFillColor(...BLUE_LIGHT); doc.rect(center - barW - .5, plotY + plotH - receivedH, barW, receivedH, "F");
    doc.setFillColor(...BLUE); doc.rect(center + .5, plotY + plotH - sentH, barW, sentH, "F");
    const stockPoint = { x: center, y: plotY + plotH - point.stock / max * plotH };
    if (previous) { doc.setDrawColor(...GOLD); doc.setLineWidth(.7); doc.line(previous.x, previous.y, stockPoint.x, stockPoint.y); }
    doc.setFillColor(...GOLD); doc.circle(stockPoint.x, stockPoint.y, 1.1, "F"); previous = stockPoint;
    if (model.trend.length <= 16 || index % Math.ceil(model.trend.length / 12) === 0) { doc.setFontSize(5.2); doc.setTextColor(...GREY); doc.text(text(point.label), center, plotY + plotH + 5, { align: "center", angle: model.trend.length > 12 ? 35 : 0 }); }
  });
  const legend = [["Recebidos", BLUE_LIGHT], ["Enviados", BLUE], ["Estoque final", GOLD]] as const;
  let lx = x + w - 65; legend.forEach(([label, color]) => { doc.setFillColor(...color); doc.rect(lx, y + 1, 3, 3, "F"); doc.setFontSize(5.8); doc.setTextColor(...GREY); doc.text(label, lx + 4, y + 3.1); lx += doc.getTextWidth(label) + 10; });
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
}

function drawTransitChart(doc: jsPDF, users: UserReportMetrics[], x: number, y: number, w: number, h: number) {
  const rows = users.map((user) => ({ label: user.name, values: [user.transit.median ?? 0, user.transit.p75 ?? 0, user.transit.p90 ?? 0] }));
  drawGroupedBars(doc, rows, [{ label: "Mediana", color: GREEN }, { label: "P75", color: BLUE }, { label: "P90", color: GOLD }], x, y, w, h, "Tempo de tramitação", "Horas úteis normalizadas; média permanece na tabela de apoio.");
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
      this.doc.text(`Práxis Web ${VERSION} | ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(this.generatedAt)} | Página ${page} de ${pages}`, width - 14, height - 8, { align: "right" });
    }
  }
}

function drawCard(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, helper = "", tone: [number, number, number] = BLUE) {
  roundedRect(doc, x, y, w, h, [249, 251, 253], [220, 228, 235]);
  doc.setFillColor(...tone); doc.rect(x, y, 2, h, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.4); doc.setTextColor(...GREY); doc.text(text(label).toUpperCase(), x + 5, y + 6);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...INK); doc.text(text(value), x + 5, y + 14);
  if (helper) { doc.setFont("helvetica", "normal"); doc.setFontSize(5.7); doc.setTextColor(...GREY); doc.text(doc.splitTextToSize(text(helper), w - 9)[0] || "", x + 5, y + h - 3.5); }
}

function executivePage(builder: PdfBuilder, model: ReportModel) {
  const doc = builder.doc;
  builder.header("PRÁXIS - RELATÓRIO GERENCIAL", `${fmtDate(model.filters.startDate)} a ${fmtDate(model.filters.endDate)} | Resumo executivo`);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...INK); doc.text("Síntese executiva", 14, 37);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(55, 75, 92); const summary = doc.splitTextToSize(text(model.synthesis), 182); doc.text(summary, 14, 43);
  const startY = 55; const gap = 4; const cardW = (182 - gap * 2) / 3; const cardH = 22;
  const cards = [
    ["Estoque inicial", fmtNumber(model.flow.initialStock), "Pendentes antes do início", BLUE],
    ["Recebidos", fmtNumber(model.flow.received), "Entradas no período", BLUE_LIGHT],
    ["Enviados", fmtNumber(model.flow.sent), "Envios no período", GREEN],
    ["Estoque final", fmtNumber(model.flow.finalStock), "Inicial + recebidos - enviados", INK],
    ["Pendentes no prazo", fmtNumber(model.deadline.pendingOnTime), "Fora da faixa de alerta", GREEN],
    ["Próximos do vencimento", fmtNumber(model.deadline.pendingNear), `Até ${model.filters.nearDueDays ?? 3} dias`, GOLD],
    ["Pendentes vencidos", fmtNumber(model.deadline.pendingOverdue), "Prazo anterior ao fim do período", RED],
    ["Concluídos no prazo", fmtPct(model.deadline.completionCompliance), `${model.deadline.completedOnTime} de ${model.deadline.completedApplicable}`, GREEN],
    ["Mediana de tramitação", formatElapsedTime(model.transit.median), model.transit.median == null ? "Sem medição" : `${model.transit.median.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} horas úteis`, BLUE],
    ["Relevância social", fmtNumber(model.highlights.socialTotal), "Processos distintos", GOLD],
    ["Alta complexidade", fmtNumber(model.highlights.complexTotal), "Processos distintos", INK],
    ["Enviados / recebidos", fmtPct(model.flow.sentReceivedRatio), "Razão do fluxo no período", BLUE],
  ] as Array<[string, string, string, [number, number, number]]>;
  cards.forEach((card, index) => drawCard(doc, 14 + (index % 3) * (cardW + gap), startY + Math.floor(index / 3) * (cardH + gap), cardW, cardH, ...card));
  const chartY = startY + 4 * (cardH + gap) + 2;
  const deadlineData: CategoryMetric[] = [
    { label: "Concluídos no prazo", value: model.deadline.completedOnTime, percentage: model.deadline.applicable ? model.deadline.completedOnTime / model.deadline.applicable * 100 : 0 },
    { label: "Concluídos com atraso", value: model.deadline.completedLate, percentage: model.deadline.applicable ? model.deadline.completedLate / model.deadline.applicable * 100 : 0 },
    { label: "Pendentes no prazo", value: model.deadline.pendingOnTime, percentage: model.deadline.applicable ? model.deadline.pendingOnTime / model.deadline.applicable * 100 : 0 },
    { label: "Próximos do vencimento", value: model.deadline.pendingNear, percentage: model.deadline.applicable ? model.deadline.pendingNear / model.deadline.applicable * 100 : 0 },
    { label: "Pendentes vencidos", value: model.deadline.pendingOverdue, percentage: model.deadline.applicable ? model.deadline.pendingOverdue / model.deadline.applicable * 100 : 0 },
  ];
  drawHorizontalBars(doc, deadlineData, 14, chartY, 88, 63, { title: "Situação dos prazos", subtitle: `Conformidade atual: ${fmtPct(model.deadline.currentConformity)}`, maxItems: 5 });
  const highlightData: CategoryMetric[] = [
    { label: "Somente relevância social", value: model.highlights.socialOnly, percentage: model.highlights.total ? model.highlights.socialOnly / model.highlights.total * 100 : 0 },
    { label: "Somente alta complexidade", value: model.highlights.complexOnly, percentage: model.highlights.total ? model.highlights.complexOnly / model.highlights.total * 100 : 0 },
    { label: "Ambas as classificações", value: model.highlights.both, percentage: model.highlights.total ? model.highlights.both / model.highlights.total * 100 : 0 },
  ];
  drawHorizontalBars(doc, highlightData, 108, chartY, 88, 63, { title: "Processos destacados", subtitle: `${model.highlights.total} processo(s) distinto(s)`, color: GOLD, maxItems: 3 });
}

function flowAndUsersPage(builder: PdfBuilder, model: ReportModel, includeTeam: boolean) {
  builder.addPage("landscape"); builder.header("FLUXO E PRODUTIVIDADE", `${fmtDate(model.filters.startDate)} a ${fmtDate(model.filters.endDate)}`, true);
  const doc = builder.doc; drawFlowChart(doc, model, 14, 29, 269, 70);
  if (!includeTeam) {
    drawHorizontalBars(doc, model.actions, 14, 108, 130, 65, { title: "Providências adotadas", subtitle: "Quantidade e participação no total filtrado", maxItems: 7 });
    drawHorizontalBars(doc, model.classes, 153, 108, 130, 65, { title: "Classes processuais", subtitle: "Principais classes no período e estoque", color: GREEN, maxItems: 7 });
    return;
  }
  drawGroupedBars(doc, model.users.map((user) => ({ label: user.name, values: [user.received, user.sent] })), [{ label: "Recebidos", color: BLUE_LIGHT }, { label: "Enviados", color: BLUE }], 14, 105, 269, 58, "Comparativo por usuário", "Pendentes e estoque aparecem na tabela, em escala própria.");
  autoTable(doc, {
    startY: 166, margin: { left: 14, right: 14, bottom: 18 },
    head: [["Usuário", "Estoque inicial", "Recebidos", "Enviados", "Saldo", "Estoque final", "Concl. prazo", "Pendentes", "Mediana"]],
    body: model.users.map((user) => [text(user.name), user.initialStock, user.received, user.sent, user.balance, user.finalStock, `${user.deadline.completedOnTime}/${user.deadline.completedApplicable}`, user.finalStock, formatElapsedTime(user.transit.median)]),
    theme: "grid", styles: { fontSize: 6.2, cellPadding: 1.4, overflow: "linebreak" }, headStyles: { fillColor: INK }, alternateRowStyles: { fillColor: [247, 249, 251] },
  });
}

function deadlinesAndTransitPage(builder: PdfBuilder, model: ReportModel, includeTeam: boolean) {
  builder.addPage("landscape"); builder.header("PRAZOS E TEMPO DE TRAMITAÇÃO", "Horas úteis calculadas pela regra central do Práxis", true);
  const doc = builder.doc;
  if (includeTeam) { drawStackedDeadlines(doc, model.users, 14, 29, 130, 72); drawTransitChart(doc, model.users, 153, 29, 130, 72); }
  else {
    const one = model.users;
    drawStackedDeadlines(doc, one, 14, 29, 130, 72); drawTransitChart(doc, one, 153, 29, 130, 72);
  }
  autoTable(doc, {
    startY: 109, margin: { left: 14, right: 14, bottom: 18 },
    head: [["Usuário", "Medições", "Média", "Mediana", "P75", "P90", "Menor", "Maior", "Mesmo dia", "Até 1 dia útil", "Até 3 dias úteis"]],
    body: model.users.map((user) => {
      const base = user.transit.count;
      return [text(user.name), base, formatElapsedTime(user.transit.mean), formatElapsedTime(user.transit.median), formatElapsedTime(user.transit.p75), formatElapsedTime(user.transit.p90), formatElapsedTime(user.transit.min), formatElapsedTime(user.transit.max), fmtPct(base ? user.transit.sameBusinessDay / base * 100 : null), fmtPct(base ? user.transit.withinOneBusinessDay / base * 100 : null), fmtPct(base ? user.transit.withinThreeBusinessDays / base * 100 : null)];
    }),
    theme: "grid", styles: { fontSize: 5.8, cellPadding: 1.35 }, headStyles: { fillColor: INK }, alternateRowStyles: { fillColor: [247, 249, 251] },
  });
  const finalY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 140) + 7;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GREY);
  doc.text(`A jornada útil adotada é de ${WORKDAY_HOURS} horas. A mediana e os percentis reduzem a distorção causada por casos excepcionais.`, 14, Math.min(finalY, 190));
}

function profilePage(builder: PdfBuilder, model: ReportModel) {
  builder.addPage("portrait"); builder.header("PERFIL DA ATUAÇÃO", "Relevância social, complexidade, ODS e providências", true);
  const doc = builder.doc;
  drawHorizontalBars(doc, model.actions, 14, 28, 182, 60, { title: "Providências", subtitle: "Quantidade e percentual no total filtrado", maxItems: 7 });
  drawHorizontalBars(doc, model.relevance.sdgs, 14, 94, 182, 64, { title: "Objetivos de Desenvolvimento Sustentável", subtitle: "Cada ODS é contado individualmente; percentual sobre processos socialmente relevantes", color: GOLD, maxItems: 7 });
  drawHorizontalBars(doc, model.classes, 14, 164, 182, 52, { title: "Classes processuais", subtitle: "Quantidade e percentual no conjunto filtrado", color: GREEN, maxItems: 6 });
  const exclusive: CategoryMetric[] = [
    { label: "Somente relevância social", value: model.highlights.socialOnly, percentage: model.highlights.total ? model.highlights.socialOnly / model.highlights.total * 100 : 0 },
    { label: "Somente alta complexidade", value: model.highlights.complexOnly, percentage: model.highlights.total ? model.highlights.complexOnly / model.highlights.total * 100 : 0 },
    { label: "Ambas as classificações", value: model.highlights.both, percentage: model.highlights.total ? model.highlights.both / model.highlights.total * 100 : 0 },
  ];
  drawHorizontalBars(doc, exclusive, 14, 222, 182, 48, { title: "Categorias exclusivas de destaque", subtitle: `Totais consolidados: relevância ${model.highlights.socialTotal}; complexidade ${model.highlights.complexTotal}; destacados ${model.highlights.total}`, color: GOLD, maxItems: 3 });
}

function relevanceProfilePage(builder: PdfBuilder, model: ReportModel) {
  builder.addPage("landscape"); builder.header("PERFIL DA RELEVÂNCIA SOCIAL", "Distribuições calculadas sobre processos socialmente relevantes", true);
  const doc = builder.doc; const w = 84; const h = 71; const xs = [14, 106.5, 199];
  drawHorizontalBars(doc, model.relevance.reach, xs[0], 29, w, h, { title: "Alcance", subtitle: "Individual qualificado, coletivo, difuso ou estrutural", color: GREEN, maxItems: 5 });
  drawHorizontalBars(doc, model.relevance.territory, xs[1], 29, w, h, { title: "Abrangência territorial", subtitle: "Do âmbito local ao nacional", color: BLUE, maxItems: 5 });
  drawHorizontalBars(doc, model.relevance.impact, xs[2], 29, w, h, { title: "Tipo de impacto", subtitle: "Direto, indireto ou reflexo", color: GOLD, maxItems: 5 });
  drawHorizontalBars(doc, model.relevance.rights, xs[0], 108, w, h, { title: "Direitos fundamentais", subtitle: "Mais frequentes", color: BLUE, maxItems: 6 });
  drawHorizontalBars(doc, model.relevance.groups, xs[1], 108, w, h, { title: "Grupos afetados", subtitle: "Mais frequentes", color: GOLD, maxItems: 6 });
  drawHorizontalBars(doc, model.relevance.themes, xs[2], 108, w, h, { title: "Temas sociais", subtitle: "Mais frequentes", color: GREEN, maxItems: 6 });
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
      user.qualityChecked ? `${user.qualityIssues} apontamento(s) em ${user.qualityChecked}` : "-",
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
      ["Concluídos no prazo", fmtPct(current.deadline.completionCompliance), fmtPct(previous.deadline.completionCompliance), "-"],
      ["Mediana de tramitação", formatElapsedTime(current.transit.median), formatElapsedTime(previous.transit.median), "-"],
      ["Relevância social", current.highlights.socialTotal, previous.highlights.socialTotal, variation(current.highlights.socialTotal, previous.highlights.socialTotal)],
      ["Alta complexidade", current.highlights.complexTotal, previous.highlights.complexTotal, variation(current.highlights.complexTotal, previous.highlights.complexTotal)],
    ],
    theme: "grid", styles: { fontSize: 7.5, cellPadding: 2.5 }, headStyles: { fillColor: INK }, alternateRowStyles: { fillColor: [247, 249, 251] },
  });
  const y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 90) + 9;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...GREY);
  doc.text(doc.splitTextToSize("A comparação repete os mesmos filtros no intervalo equivalente do ano anterior. Estoque é reconstruído em cada data; portanto, a comparação não usa apenas recebidos menos enviados.", 182), 14, y);
}

function notesPage(builder: PdfBuilder, model: ReportModel) {
  builder.addPage("portrait"); builder.header("NOTAS METODOLÓGICAS", "Definições usadas para interpretar o relatório", true);
  const doc = builder.doc; let y = 31;
  const notes = [
    ["Período considerado", `${fmtDate(model.filters.startDate)} a ${fmtDate(model.filters.endDate)}, inclusive. Datas e cortes seguem o horário local da aplicação.`],
    ["Recebido", "Movimentação cuja data de entrada está dentro do período. Retornos do mesmo número processual são movimentações distintas para fins de fluxo."],
    ["Enviado", "Movimentação com status Enviado e data de envio dentro do período, mesmo que tenha sido recebida anteriormente."],
    ["Estoque", "Estoque inicial são os registros já pendentes antes do início. Estoque final = estoque inicial + recebidos - enviados. O saldo do período não é tratado isoladamente como estoque."],
    ["Horas úteis", `São reutilizadas as horas calculadas pela função central do Práxis: jornada de ${WORKDAY_HOURS} horas, exclusão de fins de semana, feriados e recessos cadastrados, além dos descontos já aplicados pelo sistema.`],
    ["Prazos", `Concluídos e pendentes são separados. Próximo do vencimento segue o alerta atual de ${model.filters.nearDueDays ?? 3} dias. A taxa entre concluídos exclui pendentes do denominador; a conformidade atual inclui concluídos e pendentes com prazo.`],
    ["Sem prazo aplicável", "Registros sem data de prazo são informados separadamente e não entram nos denominadores de cumprimento ou conformidade."],
    ["Tempo de tramitação", "Média, mediana, percentis 75 e 90, mínimo e máximo usam horas úteis. Os percentis são interpolados na série ordenada; valores longos podem ser exibidos também em dias úteis."],
    ["ODS", "Um processo pode possuir vários Objetivos de Desenvolvimento Sustentável. Cada ODS é contado uma vez por processo e seu percentual usa como base o total de processos socialmente relevantes."],
    ["Responsabilidade", "Os cortes por usuário usam o responsável atualmente associado à movimentação. O Práxis ainda não mantém histórico temporal completo de redistribuições para reconstruir a responsabilidade em datas passadas."],
  ];
  notes.forEach(([title, body], index) => {
    doc.setFillColor(index % 2 ? 249 : 244, index % 2 ? 251 : 248, index % 2 ? 253 : 251); doc.roundedRect(14, y, 182, 20, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...INK); doc.text(text(title), 18, y + 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...GREY); doc.text(doc.splitTextToSize(text(body), 139), 52, y + 5);
    y += 22;
  });
  if (model.warnings.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...RED); doc.text("Alertas de consistência", 14, y + 3);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); model.warnings.forEach((warning, index) => doc.text(`- ${text(warning)}`, 18, y + 9 + index * 5));
  }
}

function processBlockHeight(doc: jsPDF, record: ReportModel["highlightedProcesses"][number]): number {
  const fields = [record.fundamentalRight, record.affectedGroup, record.relevanceReason, record.socialResult, record.complexityReason].filter(Boolean);
  const detailsHeight = fields.reduce((sum, value) => sum + 5.8 + doc.splitTextToSize(text(value), 170).length * 3.9, 0);
  return Math.max(62, 52 + detailsHeight + 5);
}

function highlightedAnnex(builder: PdfBuilder, model: ReportModel) {
  builder.addPage("portrait"); builder.header("ANEXO DE PROCESSOS DESTACADOS", `${model.highlightedProcesses.length} processo(s) distinto(s)`, true);
  const doc = builder.doc; let y = 29;
  if (!model.highlightedProcesses.length) { emptyChart(doc, 14, 35, 182, 45, "Nenhum processo destacado para os filtros aplicados"); return; }
  model.highlightedProcesses.forEach((record, index) => {
    const height = processBlockHeight(doc, record); const pageHeight = doc.internal.pageSize.getHeight();
    if (y + height > pageHeight - 18) { builder.addPage("portrait"); builder.header("ANEXO DE PROCESSOS DESTACADOS", `Continuação - registro ${index + 1} de ${model.highlightedProcesses.length}`, true); y = 29; }
    roundedRect(doc, 14, y, 182, Math.min(height, pageHeight - y - 18), [252, 253, 254], [205, 216, 225]);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(`Processo destacado ${index + 1} de ${model.highlightedProcesses.length}`, 18, y + 7);
    const tags = record.sociallyRelevant && record.extremelyComplex ? ["RELEVÂNCIA SOCIAL", "ALTA COMPLEXIDADE"] : [record.sociallyRelevant ? "RELEVÂNCIA SOCIAL" : "ALTA COMPLEXIDADE"];
    let tagX = 192; [...tags].reverse().forEach((tag) => { const width = doc.getTextWidth(tag) + 7; tagX -= width; doc.setDrawColor(...INK); doc.setFillColor(241, 245, 249); doc.roundedRect(tagX, y + 3, width, 6, 1.5, 1.5, "FD"); doc.setFontSize(5.5); doc.setTextColor(...INK); doc.text(tag, tagX + 3.5, y + 7); tagX -= 2; });
    const meta = [
      ["Número", record.judicialNumber], ["Classe", record.className], ["Assunto", record.subject], ["Responsável", record.assignedName || "Não identificado"],
      ["Tema social", record.socialTheme || "-"], ["Alcance", record.reach || "-"], ["Abrangência", record.territorialScope || "-"], ["Impacto", record.impactType || "-"], ["ODS", record.sdgs.join(", ") || "-"],
    ];
    const cols = [18, 78, 138];
    meta.forEach(([label, value], metaIndex) => {
      const col = metaIndex % 3; const row = Math.floor(metaIndex / 3); const top = y + 14 + row * 11.5;
      doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...GREY); doc.text(text(label).toUpperCase(), cols[col], top);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(text(value), 54).slice(0, 2), cols[col], top + 4);
    });
    let detailY = y + 52;
    const details = [
      ["Direito fundamental relacionado", record.fundamentalRight], ["Grupo afetado", record.affectedGroup],
      ["Justificativa da relevância social", record.relevanceReason], ["Impacto social esperado", record.socialResult],
      ["Justificativa da alta complexidade", record.complexityReason],
    ].filter(([, value]) => value);
    details.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(...INK); doc.text(text(label), 18, detailY);
      const lines = doc.splitTextToSize(text(value), 170); doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(55, 75, 92); doc.text(lines, 18, detailY + 4); detailY += 5.8 + lines.length * 3.9;
    });
    y += height + 5;
  });
}

export function generateManagementReportPdf(model: ReportModel, options: ReportPdfOptions): number[] {
  const generatedAt = options.generatedAt ?? new Date();
  const filters = reportFilterDescription(model.filters, options.members);
  const builder = new PdfBuilder(generatedAt, filters);
  const includeTeam = model.filters.scope === "team" && model.users.length > 1;
  if (options.mode === "highlights") {
    builder.header("PRÁXIS - PROCESSOS DESTACADOS", filters.join(" | "));
    builder.doc.setFont("helvetica", "bold"); builder.doc.setFontSize(14); builder.doc.setTextColor(...INK); builder.doc.text("Anexo gerencial", 14, 47);
    builder.doc.setFont("helvetica", "normal"); builder.doc.setFontSize(9); builder.doc.setTextColor(...GREY); builder.doc.text(builder.doc.splitTextToSize(text(model.synthesis), 182), 14, 55);
    highlightedAnnex(builder, model); notesPage(builder, model);
  } else {
    executivePage(builder, model);
    if (options.comparisonModel) historicalComparisonPage(builder, model, options.comparisonModel);
    flowAndUsersPage(builder, model, includeTeam);
    deadlinesAndTransitPage(builder, model, includeTeam);
    profilePage(builder, model);
    relevanceProfilePage(builder, model);
    if (options.mode === "complete") {
      if (includeTeam) balancedComparisonPage(builder, model);
      highlightedAnnex(builder, model);
      notesPage(builder, model);
    }
  }
  builder.finish();
  return Array.from(new Uint8Array(builder.doc.output("arraybuffer")));
}
