import { useEffect, useMemo, useState } from "react";
import { CalendarRange, FileDown, FileText, ShieldCheck } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { teamComparativeReport } from "../api";
import { formatElapsedTime } from "../date";
import { actionLabel } from "../labels";
import type { ProcessMovement, TeamComparison } from "../types";

interface Props {
  records: ProcessMovement[];
  onSave: (bytes: number[]) => Promise<string>;
  isAdmin: boolean;
}

interface Metrics {
  movements: number;
  cases: number;
  sent: number;
  pending: number;
  relevant: number;
  complex: number;
  onTime: number;
  sentWithDate: number;
  averageHours: number | null;
}

const disclaimer = "Relatório auxiliar elaborado a partir de controle individual, não substituindo os registros constantes dos sistemas oficiais da Instituição.";

function inputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateAtNoon(value: string): Date { return new Date(`${value}T12:00:00`); }

function previousYear(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = dateAtNoon(value);
  const targetYear = date.getFullYear() - 1;
  const lastDay = new Date(targetYear, date.getMonth() + 1, 0).getDate();
  return inputDate(new Date(targetYear, date.getMonth(), Math.min(date.getDate(), lastDay), 12));
}

function shortDate(value: string | null): string {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? dateAtNoon(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function periodLabel(start: string, end: string): string { return start && end ? `${shortDate(start)} a ${shortDate(end)}` : "—"; }
function safe(value: string): string { return value.trim() || "—"; }
function inPeriod(record: ProcessMovement, start: string, end: string): boolean {
  const received = record.receivedAt.slice(0, 10);
  return received >= start && received <= end;
}

function uniqueCases(records: ProcessMovement[]): ProcessMovement[] {
  const cases = new Map<number, ProcessMovement>();
  records.forEach((record) => { if (!cases.has(record.caseId)) cases.set(record.caseId, record); });
  return [...cases.values()];
}

function metrics(records: ProcessMovement[]): Metrics {
  const cases = uniqueCases(records);
  const sent = records.filter((item) => item.workflowStatus === "Enviado");
  const sentWithDate = sent.filter((item) => item.sentAt);
  const elapsed = sent.filter((item) => item.elapsedHours != null);
  return {
    movements: records.length,
    cases: cases.length,
    sent: sent.length,
    pending: records.length - sent.length,
    relevant: cases.filter((item) => item.sociallyRelevant).length,
    complex: cases.filter((item) => item.extremelyComplex).length,
    onTime: sentWithDate.filter((item) => new Date(item.sentAt as string).getTime() <= new Date(item.deadlineAt).getTime()).length,
    sentWithDate: sentWithDate.length,
    averageHours: elapsed.length ? elapsed.reduce((sum, item) => sum + (item.elapsedHours ?? 0), 0) / elapsed.length : null,
  };
}

function percentage(value: number, base: number): string {
  return base ? `${(value / base * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—";
}

function variation(current: number, previous: number): string {
  if (!previous) return current ? "Novo" : "0,0%";
  const result = (current - previous) / previous * 100;
  return `${result > 0 ? "+" : ""}${result.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function ReportsPage({ records, onSave, isAdmin }: Props) {
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(inputDate(new Date(today.getFullYear(), 0, 1)));
  const [endDate, setEndDate] = useState(inputDate(today));
  const [preset, setPreset] = useState("year");
  const [compare, setCompare] = useState(true);
  const [productivity, setProductivity] = useState(true);
  const [highlights, setHighlights] = useState(true);
  const [deadlines, setDeadlines] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [teamComparison, setTeamComparison] = useState<TeamComparison[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const years = useMemo(() => [...new Set(records.map((record) => Number(record.receivedAt.slice(0, 4))).filter(Number.isFinite))].sort((a, b) => b - a), [records]);

  function applyPreset(value: string) {
    setPreset(value);
    const end = new Date(today);
    let start = new Date(today);
    if (value === "month") start = new Date(today.getFullYear(), today.getMonth(), 1);
    if (value === "30days") { start.setDate(start.getDate() - 29); }
    if (value === "quarter") start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
    if (value === "semester") start = new Date(today.getFullYear(), today.getMonth() < 6 ? 0 : 6, 1);
    if (value === "year") start = new Date(today.getFullYear(), 0, 1);
    if (value.startsWith("year-")) {
      const selectedYear = Number(value.slice(5));
      start = new Date(selectedYear, 0, 1); end.setFullYear(selectedYear, 11, 31);
    }
    if (value === "all" && records.length) {
      const dates = records.map((record) => record.receivedAt.slice(0, 10)).sort();
      setStartDate(dates[0]); setEndDate(dates[dates.length - 1]); return;
    }
    setStartDate(inputDate(start)); setEndDate(inputDate(end));
  }

  const invalidPeriod = !startDate || !endDate || startDate > endDate;
  const previousStart = previousYear(startDate);
  const previousEnd = previousYear(endDate);
  const selected = useMemo(() => invalidPeriod ? [] : records.filter((record) => inPeriod(record, startDate, endDate)), [records, startDate, endDate, invalidPeriod]);
  const previousSelected = useMemo(() => !compare || invalidPeriod ? [] : records.filter((record) => inPeriod(record, previousStart, previousEnd)), [records, compare, invalidPeriod, previousStart, previousEnd]);
  const cases = useMemo(() => uniqueCases(selected), [selected]);
  const highlighted = cases.filter((record) => record.sociallyRelevant || record.extremelyComplex);
  const pending = selected.filter((record) => record.workflowStatus !== "Enviado").sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime());
  const currentMetrics = useMemo(() => metrics(selected), [selected]);
  const priorMetrics = useMemo(() => metrics(previousSelected), [previousSelected]);

  useEffect(() => {
    if (!isAdmin || invalidPeriod) { setTeamComparison([]); return; }
    let cancelled = false;
    setTeamLoading(true);
    teamComparativeReport(startDate, endDate)
      .then((items) => { if (!cancelled) setTeamComparison(items); })
      .catch((error) => { if (!cancelled) setMessage(`Não foi possível carregar o comparativo: ${String(error)}`); })
      .finally(() => { if (!cancelled) setTeamLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin, invalidPeriod, startDate, endDate]);

  async function generate() {
    if (invalidPeriod || (!productivity && !highlights && !deadlines)) return;
    setBusy(true); setMessage("");
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const currentPeriod = periodLabel(startDate, endDate);
      const priorPeriod = periodLabel(previousStart, previousEnd);
      doc.setFillColor(16, 42, 67); doc.rect(0, 0, pageWidth, 27, "F");
      doc.setFillColor(184, 138, 36); doc.rect(0, 27, pageWidth, 1.2, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(17);
      doc.text("PRÁXIS — RELATÓRIO DE ACOMPANHAMENTO PROCESSUAL", 14, 12);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(`Período: ${currentPeriod}${compare ? `  |  Comparação: ${priorPeriod}` : ""}`, 14, 18);
      doc.text(`Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`, 14, 23);
      let y = 36;
      const section = (title: string) => {
        if (y > 175) { doc.addPage(); y = 18; }
        doc.setTextColor(16, 42, 67); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(title, 14, y); y += 5;
      };
      const afterTable = () => { y = ((doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8; };

      if (productivity) {
        section("1. Resumo de produtividade");
        const rows = [
          ["Processos distintos", currentMetrics.cases, "100,0%", priorMetrics.cases, variation(currentMetrics.cases, priorMetrics.cases)],
          ["Movimentações recebidas", currentMetrics.movements, "100,0%", priorMetrics.movements, variation(currentMetrics.movements, priorMetrics.movements)],
          ["Enviadas", currentMetrics.sent, percentage(currentMetrics.sent, currentMetrics.movements), priorMetrics.sent, variation(currentMetrics.sent, priorMetrics.sent)],
          ["Pendentes", currentMetrics.pending, percentage(currentMetrics.pending, currentMetrics.movements), priorMetrics.pending, variation(currentMetrics.pending, priorMetrics.pending)],
          ["Relevância social", currentMetrics.relevant, percentage(currentMetrics.relevant, currentMetrics.cases), priorMetrics.relevant, variation(currentMetrics.relevant, priorMetrics.relevant)],
          ["Alta complexidade", currentMetrics.complex, percentage(currentMetrics.complex, currentMetrics.cases), priorMetrics.complex, variation(currentMetrics.complex, priorMetrics.complex)],
          ["Enviadas dentro do prazo", currentMetrics.onTime, percentage(currentMetrics.onTime, currentMetrics.sentWithDate), priorMetrics.onTime, variation(currentMetrics.onTime, priorMetrics.onTime)],
          ["Tempo médio de resposta", formatElapsedTime(currentMetrics.averageHours), "—", formatElapsedTime(priorMetrics.averageHours), currentMetrics.averageHours == null || priorMetrics.averageHours == null ? "—" : variation(currentMetrics.averageHours, priorMetrics.averageHours)],
        ];
        autoTable(doc, {
          startY: y,
          head: [compare ? ["Indicador", "Quantidade", "%", "Período anterior", "Variação"] : ["Indicador", "Quantidade", "%"]],
          body: rows.map((row) => compare ? row : row.slice(0, 3)),
          theme: "grid", tableWidth: compare ? 180 : 130, styles: { fontSize: 8.4, cellPadding: 2.5 }, headStyles: { fillColor: [30, 96, 145] },
        }); afterTable();
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(98, 125, 152);
        doc.text("Bases percentuais: enviados e pendentes sobre movimentações; destaques sobre processos distintos; cumprimento de prazo sobre envios com data registrada.", 14, y); y += 7;

        const currentActions = new Map<string, number>();
        const priorActions = new Map<string, number>();
        selected.forEach((item) => currentActions.set(actionLabel(item.actionType), (currentActions.get(actionLabel(item.actionType)) ?? 0) + 1));
        previousSelected.forEach((item) => priorActions.set(actionLabel(item.actionType), (priorActions.get(actionLabel(item.actionType)) ?? 0) + 1));
        const actions = [...new Set([...currentActions.keys(), ...priorActions.keys()])].sort((a, b) => (currentActions.get(b) ?? 0) - (currentActions.get(a) ?? 0));
        autoTable(doc, {
          startY: y,
          head: [compare ? ["Providência", "Quantidade", "%", "Período anterior", "Variação"] : ["Providência", "Quantidade", "%"]],
          body: actions.map((name) => {
            const current = currentActions.get(name) ?? 0; const prior = priorActions.get(name) ?? 0;
            const row = [name, current, percentage(current, currentMetrics.movements), prior, variation(current, prior)];
            return compare ? row : row.slice(0, 3);
          }),
          theme: "striped", tableWidth: compare ? 180 : 130, styles: { fontSize: 8, cellPadding: 2.3 }, headStyles: { fillColor: [72, 101, 129] },
        }); afterTable();
      }

      if (isAdmin && teamComparison.length) {
        section("Comparativo de produtividade da equipe — acesso administrativo");
        autoTable(doc, {
          startY: y,
          head: [["Usuário", "Recebidos", "Enviados", "Pendentes", "No prazo", "Tempo médio"]],
          body: teamComparison.map((item) => [
            item.fullName || item.email, item.received, item.sent, item.pending,
            `${item.onTime} (${percentage(item.onTime, item.sent)})`,
            formatElapsedTime(item.averageHours),
          ]),
          theme: "grid", styles: { fontSize: 8.2, cellPadding: 2.4 }, headStyles: { fillColor: [16, 42, 67] },
        }); afterTable();
      }

      if (highlights) {
        section(`${productivity ? "2" : "1"}. Processos destacados`);
        if (highlighted.length) {
          autoTable(doc, {
            startY: y,
            head: [["Processo judicial", "Classificação", "Classe / assunto", "Fundamento do destaque", "Impacto / resultado"]],
            body: highlighted.map((item) => {
              const labels = [item.sociallyRelevant ? "Relevância social" : "", item.extremelyComplex ? "Alta complexidade" : ""].filter(Boolean).join(" + ");
              const foundation = [item.socialTheme, item.fundamentalRight, item.affectedGroup, item.relevanceReason, item.complexityReason].filter((value) => value.trim()).join(" | ");
              const impact = [item.reach, item.territorialScope, item.impactType, item.socialResult].filter((value) => value.trim()).join(" | ");
              return [item.judicialNumber, labels, `${item.className}\n${safe(item.subject)}`, foundation || "—", impact || "—"];
            }),
            theme: "grid", styles: { fontSize: 7.3, cellPadding: 2.2, overflow: "linebreak" }, headStyles: { fillColor: [147, 105, 24] },
            columnStyles: { 0: { cellWidth: 39 }, 1: { cellWidth: 32 }, 2: { cellWidth: 58 }, 3: { cellWidth: 72 }, 4: { cellWidth: 68 } },
          }); afterTable();
        } else {
          doc.setFont("helvetica", "normal"); doc.setTextColor(98, 125, 152); doc.setFontSize(9); doc.text("Nenhum processo destacado no período selecionado.", 14, y + 2); y += 10;
        }
      }

      if (deadlines) {
        const position = (productivity ? 1 : 0) + (highlights ? 1 : 0) + 1;
        section(`${position}. Prazos e pendências`);
        if (pending.length) {
          const shown = pending.slice(0, 100);
          autoTable(doc, {
            startY: y, head: [["Processo judicial", "Classe", "Entrada", "Prazo", "Status", "Providência", "Prioridade"]],
            body: shown.map((item) => [item.judicialNumber, item.className, shortDate(item.receivedAt), shortDate(item.deadlineAt), item.workflowStatus, actionLabel(item.actionType), item.priority]),
            theme: "striped", styles: { fontSize: 7.5, cellPadding: 2.1 }, headStyles: { fillColor: [72, 101, 129] },
          }); afterTable();
          if (pending.length > shown.length) { doc.setTextColor(98, 125, 152); doc.setFontSize(8); doc.text(`Exibidos os 100 prazos mais próximos de ${pending.length} pendências.`, 14, y); y += 7; }
        } else {
          doc.setFont("helvetica", "normal"); doc.setTextColor(98, 125, 152); doc.setFontSize(9); doc.text("Nenhuma pendência no período selecionado.", 14, y + 2);
        }
      }

      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page); const height = doc.internal.pageSize.getHeight();
        doc.setDrawColor(217, 226, 236); doc.line(14, height - 13, pageWidth - 14, height - 13);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(98, 125, 152);
        doc.text(disclaimer, 14, height - 8); doc.text(`Práxis Online 0.5.1  |  Página ${page} de ${pages}`, pageWidth - 14, height - 8, { align: "right" });
      }
      setMessage(await onSave(Array.from(new Uint8Array(doc.output("arraybuffer")))));
    } catch (error) {
      setMessage(`Não foi possível gerar o relatório: ${String(error)}`);
    } finally { setBusy(false); }
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Documento local</p><h1>Relatórios em PDF</h1><p>Gere um relatório consolidado para acompanhamento pessoal e interno.</p></div></div>
    <div className="reports-layout">
      <section className="panel report-builder">
        <div className="panel-title"><div><h2>Configurar relatório</h2><p>O período é aplicado à data de entrada dos registros.</p></div><FileText size={22} /></div>
        <div className="report-period-grid">
          <label>Atalho<select value={preset} onChange={(event) => applyPreset(event.target.value)}><option value="month">Mês atual</option><option value="30days">Últimos 30 dias</option><option value="quarter">Trimestre atual</option><option value="semester">Semestre atual</option><option value="year">Ano atual até hoje</option>{years.map((year) => <option key={year} value={`year-${year}`}>Ano completo de {year}</option>)}<option value="all">Todos os registros</option><option value="custom">Período personalizado</option></select></label>
          <label>Data inicial<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPreset("custom"); }} /></label>
          <label>Data final<input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPreset("custom"); }} /></label>
        </div>
        {invalidPeriod && <div className="period-error">A data inicial não pode ser posterior à data final.</div>}
        <label className="comparison-option"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} /><CalendarRange size={18} /><span><strong>Comparar com o mesmo período do ano anterior</strong><small>{periodLabel(previousStart, previousEnd)}</small></span></label>
        <div className="report-options">
          <label><input type="checkbox" checked={productivity} onChange={(event) => setProductivity(event.target.checked)} /><span><strong>Resumo de produtividade</strong><small>Quantidades, percentuais, variações, tempo médio e providências.</small></span></label>
          <label><input type="checkbox" checked={highlights} onChange={(event) => setHighlights(event.target.checked)} /><span><strong>Processos destacados</strong><small>Relevância social e alta complexidade.</small></span></label>
          <label><input type="checkbox" checked={deadlines} onChange={(event) => setDeadlines(event.target.checked)} /><span><strong>Prazos e pendências</strong><small>Registros não enviados, ordenados pelo prazo.</small></span></label>
        </div>
        {isAdmin && <section className="admin-comparison"><div className="panel-title"><div><h2>Comparativo da equipe</h2><p>Visível exclusivamente para administradores.</p></div></div>{teamLoading ? <div className="table-loading">Calculando indicadores...</div> : <div className="table-scroll"><table><thead><tr><th>Usuário</th><th>Recebidos</th><th>Enviados</th><th>Pendentes</th><th>No prazo</th><th>Tempo médio</th></tr></thead><tbody>{teamComparison.map((item) => <tr key={item.userId}><td><strong>{item.fullName || item.email}</strong></td><td>{item.received}</td><td>{item.sent}</td><td>{item.pending}</td><td>{item.onTime} ({percentage(item.onTime, item.sent)})</td><td>{formatElapsedTime(item.averageHours)}</td></tr>)}</tbody></table>{!teamComparison.length && <div className="empty-state">Nenhum usuário ativo encontrado.</div>}</div>}</section>}
        <button className="button primary report-button" disabled={busy || !records.length || invalidPeriod || (!productivity && !highlights && !deadlines)} onClick={generate}><FileDown size={18} />{busy ? "Gerando PDF..." : "Gerar relatório PDF"}</button>
        {message && <div className="info-box">{message}</div>}
      </section>
      <aside className="panel report-preview">
        <div className="report-preview-icon"><ShieldCheck size={28} /></div><h2>Prévia do conteúdo</h2>
        <dl><div><dt>Período</dt><dd>{periodLabel(startDate, endDate)}</dd></div><div><dt>Processos</dt><dd>{currentMetrics.cases}</dd></div><div><dt>Movimentações</dt><dd>{currentMetrics.movements}</dd></div><div><dt>Enviadas</dt><dd>{currentMetrics.sent} ({percentage(currentMetrics.sent, currentMetrics.movements)})</dd></div><div><dt>Pendentes</dt><dd>{currentMetrics.pending} ({percentage(currentMetrics.pending, currentMetrics.movements)})</dd></div><div><dt>Destacados</dt><dd>{highlighted.length} ({percentage(highlighted.length, currentMetrics.cases)})</dd></div></dl>
        {compare && <div className="comparison-preview"><strong>Período anterior</strong><span>{periodLabel(previousStart, previousEnd)}</span><small>{priorMetrics.movements} movimentação(ões)</small></div>}
        <p>{disclaimer}</p><small>O PDF é gerado no navegador e baixado para o computador do usuário.</small>
      </aside>
    </div>
  </div>;
}
