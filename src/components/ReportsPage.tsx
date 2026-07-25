import { useMemo, useState } from "react";
import { CalendarRange, FileDown, FileSpreadsheet, FileText, ShieldCheck } from "lucide-react";
import { localDatePart } from "../date";
import { actionLabel } from "../labels";
import { buildReportFileName, buildReportModel, effectiveCoverageSince, reportScopeInfo, type HighlightFilter, type ReportMode } from "../reporting";
import { generateManagementReportPdf } from "../reportPdf";
import type { ProcessMovement, TeamMember } from "../types";
import { PRAXIS_VERSION } from "../version";

interface Props { records: ProcessMovement[]; members: TeamMember[]; currentUserId: string; onSave: (bytes: number[], fileName: string) => Promise<string>; accessScope: "own" | "team"; }
function inputDate(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function dateAtNoon(value: string): Date { return new Date(`${value}T12:00:00-03:00`); }
function previousYear(value: string): string { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ""; const date = dateAtNoon(value); const year = date.getUTCFullYear() - 1; const lastDay = new Date(Date.UTC(year, date.getUTCMonth() + 1, 0)).getUTCDate(); return `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(date.getUTCDate(), lastDay)).padStart(2, "0")}`; }
function shortDate(value: string): string { return value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Belem" }).format(dateAtNoon(value)) : "-"; }
function percentage(value: number | null): string { return value == null ? "-" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`; }

const MODES: Array<{ value: ReportMode; title: string; description: string; icon: typeof FileText }> = [
  { value: "executive", title: "Relatório Executivo", description: "Painel gerencial, fluxo, prazos, tempos, destaques, ODS e providências.", icon: FileSpreadsheet },
  { value: "complete", title: "Relatório Completo", description: "Parte executiva, comparação detalhada, anexo e notas metodológicas.", icon: FileText },
  { value: "highlights", title: "Anexo de Processos Destacados", description: "Blocos detalhados de relevância social e alta complexidade.", icon: ShieldCheck },
];

export function ReportsPage({ records, members, currentUserId, onSave, accessScope }: Props) {
  const canViewTeam = accessScope === "team";
  const today = useMemo(() => new Date(), []);
  const [startDate, setStartDate] = useState(inputDate(new Date(today.getFullYear(), 0, 1)));
  const [endDate, setEndDate] = useState(inputDate(today));
  const [preset, setPreset] = useState("year");
  const [mode, setMode] = useState<ReportMode>("executive");
  const [scope, setScope] = useState(canViewTeam ? "team" : currentUserId);
  const [className, setClassName] = useState("all");
  const [actionType, setActionType] = useState("all");
  const [highlight, setHighlight] = useState<HighlightFilter>("all");
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const years = useMemo(() => [...new Set(records.map((record) => Number(localDatePart(record.receivedAt).slice(0, 4))).filter(Number.isFinite))].sort((a, b) => b - a), [records]);
  const classes = useMemo(() => [...new Set(records.map((record) => record.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [records]);
  const actions = useMemo(() => [...new Set(records.map((record) => actionLabel(record.actionType)))].sort((a, b) => a.localeCompare(b, "pt-BR")), [records]);

  function applyPreset(value: string) {
    setPreset(value); const end = new Date(today); let start = new Date(today);
    if (value === "month") start = new Date(today.getFullYear(), today.getMonth(), 1);
    if (value === "30days") start.setDate(start.getDate() - 29);
    if (value === "year") start = new Date(today.getFullYear(), 0, 1);
    if (value.startsWith("year-")) { const year = Number(value.slice(5)); start = new Date(year, 0, 1); end.setFullYear(year, 11, 31); }
    setStartDate(inputDate(start)); setEndDate(inputDate(end));
  }

  const invalidPeriod = !startDate || !endDate || startDate > endDate;
  const filters = useMemo(() => ({ startDate, endDate, scope: canViewTeam ? scope : currentUserId, className, actionType, highlight, nearDueDays: 3 }), [actionType, className, currentUserId, endDate, highlight, canViewTeam, scope, startDate]);
  const model = useMemo(() => invalidPeriod ? null : buildReportModel(records, members, filters), [filters, invalidPeriod, members, records]);
  const previousStart = previousYear(startDate); const previousEnd = previousYear(endDate);
  const comparableMembers = useMemo(() => members.filter((member) => {
    if (!member.active) return false;
    const since = effectiveCoverageSince(records, member);
    return Boolean(since && since <= startDate && since <= previousStart);
  }), [members, previousStart, records, startDate]);
  async function generate() {
    if (!model) return;
    setBusy(true); setMessage("");

    // Permite que o navegador desenhe o estado "Gerando..." antes do cálculo pesado.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    try {
      const comparisonModel = compare && !invalidPeriod && comparableMembers.length
        ? buildReportModel(records, comparableMembers, { ...filters, startDate: previousStart, endDate: previousEnd })
        : undefined;
      const comparisonCurrentModel = compare && !invalidPeriod && comparableMembers.length
        ? buildReportModel(records, comparableMembers, filters)
        : undefined;
      const bytes = generateManagementReportPdf(model, { mode, members, comparisonModel, comparisonCurrentModel });
      setMessage(await onSave(bytes, buildReportFileName(mode, model, members)));
    } catch (error) {
      setMessage(`Não foi possível gerar o relatório: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Práxis Web {PRAXIS_VERSION}</p><h1>Relatórios gerenciais</h1><p>Analise fluxo, estoque, produtividade, prazos e relevância com indicadores conciliados.</p></div></div>
    <div className="reports-layout">
      <section className="panel report-builder">
        <div className="panel-title"><div><h2>1. Modalidade</h2><p>Escolha a profundidade do documento.</p></div><FileText size={22} /></div>
        <div className="report-mode-grid">{MODES.map((item) => { const Icon = item.icon; return <label key={item.value} className={mode === item.value ? "report-mode selected" : "report-mode"}><input type="radio" name="report-mode" checked={mode === item.value} onChange={() => setMode(item.value)} /><Icon size={20} /><span><strong>{item.title}</strong><small>{item.description}</small></span></label>; })}</div>
        <div className="panel-title report-filter-title"><div><h2>2. Período e escopo</h2><p>Todos os números e gráficos respeitam estes filtros.</p></div><CalendarRange size={21} /></div>
        <div className="report-period-grid"><label>Período<select value={preset} onChange={(event) => applyPreset(event.target.value)}><option value="month">Mês atual</option><option value="30days">Últimos 30 dias</option><option value="year">Ano atual até hoje</option>{years.map((year) => <option key={year} value={`year-${year}`}>Ano completo de {year}</option>)}<option value="custom">Intervalo personalizado</option></select></label><label>Data inicial<input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPreset("custom"); }} /></label><label>Data final<input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPreset("custom"); }} /></label></div>
        {invalidPeriod && <div className="period-error">A data inicial não pode ser posterior à data final.</div>}
        <div className="report-filter-grid"><label>Usuário responsável<select value={canViewTeam ? scope : currentUserId} disabled={!canViewTeam} onChange={(event) => setScope(event.target.value)}>{canViewTeam && <option value="team">Equipe inteira</option>}{members.filter((member) => member.active && (canViewTeam || member.userId === currentUserId)).map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email}</option>)}</select></label><label>Classe processual<select value={className} onChange={(event) => setClassName(event.target.value)}><option value="all">Todas as classes</option>{classes.map((item) => <option key={item}>{item}</option>)}</select></label><label>Providência<select value={actionType} onChange={(event) => setActionType(event.target.value)}><option value="all">Todas as providências</option>{actions.map((item) => <option key={item}>{item}</option>)}</select></label><label>Classificação<select value={highlight} onChange={(event) => setHighlight(event.target.value as HighlightFilter)}><option value="all">Todas</option><option value="social">Relevância social</option><option value="complex">Alta complexidade</option><option value="both">Ambas as classificações</option></select></label></div>
        <label className="comparison-option"><input type="checkbox" disabled={!canViewTeam} checked={compare} onChange={(event) => setCompare(event.target.checked)} /><CalendarRange size={18} /><span><strong>Comparar com o mesmo período do ano anterior</strong><small>{shortDate(previousStart)} a {shortDate(previousEnd)}</small></span></label>
        {compare && <div className="comparison-preview"><strong>Equipe comparável: {comparableMembers.length} {comparableMembers.length === 1 ? "usuário com cobertura nos dois períodos" : "usuários com cobertura nos dois períodos"}</strong><span>Quando a composição histórica difere, esta é a comparação principal; usuários sem histórico não aparecem como zero.</span></div>}
        {!canViewTeam && <div className="report-access-note"><ShieldCheck size={17} /><span>Seu perfil gera somente o relatório individual. O comparativo da equipe permanece restrito aos perfis autorizados.</span></div>}
        <button className="button primary report-button" disabled={busy || !model || !records.length} onClick={generate}><FileDown size={18} />{busy ? "Gerando e conferindo o PDF..." : "Gerar relatório PDF"}</button>{message && <div className="info-box">{message}</div>}
      </section>
      <aside className="panel report-preview"><div className="report-preview-icon"><ShieldCheck size={28} /></div><h2>Prévia conciliada</h2>{model ? <><dl><div><dt>Período</dt><dd>{shortDate(startDate)} a {shortDate(endDate)}</dd></div><div><dt>Escopo</dt><dd>{reportScopeInfo(model, members).title}</dd></div><div><dt>Cobertura histórica</dt><dd>{model.coverage.available} de {model.coverage.total} usuários</dd></div>{reportScopeInfo(model, members).kind === "individual" ? <div><dt>Responsável</dt><dd>{reportScopeInfo(model, members).responsibleName}</dd></div> : <div><dt>Usuários considerados</dt><dd>{reportScopeInfo(model, members).usersConsidered}</dd></div>}<div><dt>Estoque inicial</dt><dd>{model.flow.initialStock}</dd></div><div><dt>Recebidos</dt><dd>{model.flow.received}</dd></div><div><dt>Enviados</dt><dd>{model.flow.sent}</dd></div><div><dt>Estoque final</dt><dd>{model.flow.finalStock}</dd></div><div><dt>Concluídos no prazo</dt><dd>{model.deadline.completionCompliance == null ? "Não aplicável" : percentage(model.deadline.completionCompliance)}</dd></div><div><dt>Sem prazo aplicável</dt><dd>{model.deadline.noDeadline}</dd></div><div><dt>Pendentes vencidos</dt><dd>{model.deadline.pendingOverdue}</dd></div><div><dt>Destacados</dt><dd>{model.highlights.total}</dd></div></dl><div className={model.flow.reconciliationDifference ? "report-reconciliation warning" : "report-reconciliation ok"}><strong>Conciliação do estoque</strong><span>{model.flow.initialStock} + {model.flow.received} - {model.flow.sent} = {model.flow.finalStock}</span><small>{model.flow.reconciliationDifference ? "Há inconsistência histórica a conferir." : "Conciliação verificada."}</small></div></> : <div className="empty-state">Defina um período válido.</div>}<p>O PDF inclui definições metodológicas e informa os filtros, a versão do Práxis e a data e hora de geração.</p><small>Todos os indicadores são calculados no momento da geração; nenhum número é fixo.</small></aside>
    </div>
  </div>;
}
