import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck2, CalendarDays, ClockAlert, DatabaseZap, Files, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { daysUntil, formatDate, formatElapsedTime, localDatePart } from "../date";
import { inspectDataQuality } from "../dataQuality";
import { actionLabel } from "../labels";
import { summarizeActionGroups, type ActionGroupSummary } from "../actionGroups";
import { hapticFeedback } from "../mobileInteractions";
import type { ProcessListPreset, ProcessMovement } from "../types";
import { HelpTip } from "./HelpTip";
import { StatCard } from "./StatCard";

interface Props {
  records: ProcessMovement[];
  currentUserId: string;
  currentUserName: string;
  canOpenQuality: boolean;
  onOpenProcesses: (preset: ProcessListPreset) => void;
  onOpenQuality: () => void;
}

interface MonthlyPoint {
  label: string;
  month: string;
  monthIndex: number;
  year: number;
  current?: number;
  previous?: number;
  total?: number;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const PIE_COLORS = ["#2D7FF9", "#14804A", "#B7791F", "#6D5BD0", "#64748B"];

function NatureTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: ActionGroupSummary }> }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return <div className="nature-tooltip"><strong>{item.name}</strong><span>{item.value} processos · {item.percentage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span><div>{item.details.map((detail) => <p key={detail.name}><b>{detail.name}</b><em>{detail.value}</em></p>)}</div></div>;
}

function startOfWeek(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export function Dashboard({ records, currentUserId, currentUserName, canOpenQuality, onOpenProcesses, onOpenQuality }: Props) {
  const now = new Date();
  const todayLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(now);
  const activeRecords = useMemo(() => records.filter((record) => !record.deletedAt && !record.archivedAt), [records]);
  const [selectedAssignee, setSelectedAssignee] = useState(currentUserId);
  const scopedRecords = useMemo(() => selectedAssignee === "Todos" ? activeRecords : activeRecords.filter((record) => record.assignedTo === selectedAssignee), [activeRecords, selectedAssignee]);
  const years = useMemo(() => [...new Set<number>(scopedRecords.map((record) => new Date(record.receivedAt).getFullYear()).filter(Number.isFinite))].sort((a, b) => b - a), [scopedRecords]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [comparisonMode, setComparisonMode] = useState<"same" | "full">("same");
  const [movementMode, setMovementMode] = useState<"previous-year" | "last-12">("previous-year");

  useEffect(() => {
    if (!years.length) { setSelectedPeriod("Todos"); return; }
    const special = selectedPeriod === "MesAtual" || selectedPeriod === "Ultimos30";
    if (!selectedPeriod || (!special && selectedPeriod !== "Todos" && !years.includes(Number(selectedPeriod)))) setSelectedPeriod(String(years[0]));
  }, [years, selectedPeriod]);

  const filteredRecords = useMemo(() => {
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    if (selectedPeriod === "MesAtual") return scopedRecords.filter((record) => {
      const date = new Date(`${record.receivedAt.slice(0, 10)}T12:00:00`);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
    if (selectedPeriod === "Ultimos30") {
      const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 29);
      return scopedRecords.filter((record) => { const date = new Date(`${record.receivedAt.slice(0, 10)}T12:00:00`); return date >= start && date <= todayEnd; });
    }
    if (selectedPeriod && selectedPeriod !== "Todos") return scopedRecords.filter((record) => new Date(record.receivedAt).getFullYear() === Number(selectedPeriod));
    return scopedRecords;
  }, [scopedRecords, selectedPeriod]);

  const assignedPreset = selectedAssignee === "Todos" ? undefined : selectedAssignee;
  const pending = scopedRecords.filter((record) => record.workflowStatus !== "Enviado");
  const todayKey = localDatePart(now.toISOString());
  const sentToday = scopedRecords.filter((record) => record.sentAt && localDatePart(record.sentAt) === todayKey);
  const weekStart = startOfWeek(now);
  const sentWeek = scopedRecords.filter((record) => record.sentAt && new Date(record.sentAt) >= weekStart);
  const overdue = pending.filter((record) => Boolean(record.deadlineAt) && daysUntil(record.deadlineAt) < 0);
  const qualityIssues = useMemo(() => inspectDataQuality(scopedRecords), [scopedRecords]);
  const affectedRecords = new Set(qualityIssues.map((issue) => issue.record.movementId)).size;
  const qualityScore = scopedRecords.length ? Math.round(((scopedRecords.length - affectedRecords) / scopedRecords.length) * 100) : 100;

  const sent = filteredRecords.filter((record) => record.workflowStatus === "Enviado");
  const measuredSent = sent.filter((record) => record.receivedTimePrecise === true && record.sentTimePrecise === true && record.elapsedHours !== null && Number.isFinite(record.elapsedHours));
  const averageHours = measuredSent.length ? measuredSent.reduce((sum, record) => sum + (record.elapsedHours as number), 0) / measuredSent.length : null;
  const actions = useMemo(() => summarizeActionGroups(filteredRecords.map((record) => actionLabel(record.actionType))), [filteredRecords]);
  const priorityRecords = [...filteredRecords.filter((record) => record.workflowStatus !== "Enviado")].sort((a, b) => daysUntil(a.deadlineAt) - daysUntil(b.deadlineAt)).slice(0, 6);

  const currentYear = now.getFullYear();
  const previousYear = currentYear - 1;
  const countMonth = (year: number, month: number) => scopedRecords.filter((record) => {
    const date = new Date(record.receivedAt);
    return date.getFullYear() === year && date.getMonth() === month;
  }).length;
  const previousYearData: MonthlyPoint[] = MONTHS.map((month, monthIndex) => ({
    label: month,
    month,
    monthIndex,
    year: currentYear,
    current: countMonth(currentYear, monthIndex),
    previous: countMonth(previousYear, monthIndex),
  }));
  const last12Data: MonthlyPoint[] = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(currentYear, now.getMonth() - 11 + index, 1, 12);
    return {
      label: `${MONTHS[date.getMonth()]}/${String(date.getFullYear()).slice(-2)}`,
      month: MONTHS[date.getMonth()],
      monthIndex: date.getMonth(),
      year: date.getFullYear(),
      total: countMonth(date.getFullYear(), date.getMonth()),
    };
  });
  const monthly = movementMode === "previous-year" ? previousYearData : last12Data;
  const currentMonth = previousYearData[now.getMonth()];
  const variation = currentMonth.previous ? ((currentMonth.current ?? 0) / currentMonth.previous - 1) * 100 : null;
  const variationText = variation === null
    ? `sem base em ${MONTHS_LONG[now.getMonth()]}/${previousYear}`
    : `${variation >= 0 ? "+" : ""}${variation.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% em relação a ${MONTHS_LONG[now.getMonth()]}/${previousYear}`;

  function openPreset(preset: ProcessListPreset) {
    hapticFeedback();
    onOpenProcesses({ ...preset, assignedTo: assignedPreset });
  }

  function chartClick(entry: unknown, seriesYear?: number) {
    const point = (entry as { payload?: MonthlyPoint })?.payload;
    if (!point) return;
    const year = seriesYear ?? point.year;
    openPreset({ kind: "month", label: `${MONTHS_LONG[point.monthIndex]}/${year}`, year, month: point.monthIndex });
  }

  const latestYear = years[0];
  const latestYearDates = scopedRecords.filter((record) => new Date(record.receivedAt).getFullYear() === latestYear).map((record) => new Date(record.receivedAt)).filter((date) => !Number.isNaN(date.getTime()));
  const cutoffDate = latestYearDates.length ? new Date(Math.max(...latestYearDates.map((date) => date.getTime()))) : now;
  const cutoffKey = (cutoffDate.getMonth() + 1) * 100 + cutoffDate.getDate();
  const cutoffLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(cutoffDate);
  const recordsForYear = (year: number) => scopedRecords.filter((record) => {
    const date = new Date(record.receivedAt);
    return date.getFullYear() === year && (comparisonMode === "full" || (date.getMonth() + 1) * 100 + date.getDate() <= cutoffKey);
  });
  const yearly = [...years].reverse().map((year, index, allYears) => {
    const items = recordsForYear(year);
    const yearSent = items.filter((record) => record.workflowStatus === "Enviado");
    const hours = yearSent.filter((record) => record.receivedTimePrecise && record.sentTimePrecise).map((record) => record.elapsedHours).filter((value): value is number => value !== null && Number.isFinite(value));
    const grouped = summarizeActionGroups(items.map((record) => actionLabel(record.actionType)));
    const count = (name: string) => grouped.find((item) => item.name === name)?.value ?? 0;
    const prior = allYears[index - 1];
    const priorTotal = prior ? recordsForYear(prior).length : 0;
    return { year, total: items.length, sent: yearSent.length, diligence: count("Diligências e medidas processuais"), unnecessary: count("Desnecessária intervenção"), science: count("Ciência"), interventions: count("Intervenção"), averageHours: hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : null, variation: priorTotal ? (items.length / priorTotal - 1) * 100 : null };
  });

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">{todayLabel}</p><h1>Visão geral</h1><p>{selectedAssignee === "Todos" ? "Acompanhe a fila, os prazos e a produção de toda a equipe." : "Acompanhe sua fila, seus prazos e sua produção."}</p></div><div className="dashboard-controls"><label className="year-control">Responsável<select value={selectedAssignee} onChange={(event) => setSelectedAssignee(event.target.value)}><option value={currentUserId}>{currentUserName || "Meus dados"}</option><option value="Todos">Todos os usuários</option></select></label><label className="year-control">Período<select value={selectedPeriod || "Todos"} onChange={(event) => setSelectedPeriod(event.target.value)}><option value="MesAtual">Mês atual</option><option value="Ultimos30">Últimos 30 dias</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}<option value="Todos">Todos</option></select></label></div></div>

    <div className="stats-grid stats-grid-v0107">
      <StatCard label="Pendentes" value={pending.length} helper="abrir lista pendente" icon={Files} onClick={() => openPreset({ kind: "pending", label: "Pendentes" })} />
      <StatCard label="Enviados hoje" value={sentToday.length} helper="concluídos nesta data" icon={CalendarCheck2} tone="green" onClick={() => openPreset({ kind: "sent-today", label: "Enviados hoje" })} />
      <StatCard label="Enviados na semana" value={sentWeek.length} helper="desde segunda-feira" icon={CalendarDays} tone="green" onClick={() => openPreset({ kind: "sent-week", label: "Enviados na semana" })} />
      <StatCard label="Atrasados" value={overdue.length} helper="prazo já vencido" icon={ClockAlert} tone="red" onClick={() => openPreset({ kind: "overdue", label: "Atrasados" })} />
      {canOpenQuality && <StatCard label="Inconsistências" value={qualityIssues.length} helper="ver diagnósticos" icon={AlertTriangle} tone="amber" onClick={() => { hapticFeedback(); onOpenQuality(); }} />}
      {canOpenQuality && <StatCard label="Qualidade dos dados" value={`${qualityScore}%`} helper={`${affectedRecords} registro(s) com apontamento`} icon={ShieldCheck} onClick={() => { hapticFeedback(); onOpenQuality(); }} />}
    </div>

    <div className="dashboard-grid"><section className="panel chart-panel wide movement-chart-v0107"><div className="panel-title comparison-title"><div><h2>Movimento Mensal</h2><p className="movement-indicator"><strong>{MONTHS_LONG[now.getMonth()][0].toUpperCase() + MONTHS_LONG[now.getMonth()].slice(1)}/{currentYear}</strong><span className={variation !== null && variation < 0 ? "negative" : "positive"}>{variationText}</span></p></div><label className="year-control">Visualização<select value={movementMode} onChange={(event) => setMovementMode(event.target.value as "previous-year" | "last-12")}><option value="previous-year">Comparar com ano anterior</option><option value="last-12">Últimos 12 meses</option></select></label></div><div className="chart-legend" aria-label="Legenda do gráfico">{movementMode === "previous-year" ? <><span><i className="current-year" />{currentYear}</span><span><i className="previous-year" />{previousYear}</span></> : <span><i className="current-year" />Processos recebidos</span>}<small>Clique em uma coluna para abrir os processos do mês.</small></div><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly} barGap={4}><CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip />{movementMode === "previous-year" ? <><Bar dataKey="current" name={String(currentYear)} fill="#2D7FF9" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(entry: unknown) => chartClick(entry, currentYear)} /><Bar dataKey="previous" name={String(previousYear)} fill="#8CC6FF" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(entry: unknown) => chartClick(entry, previousYear)} /></> : <Bar dataKey="total" name="Processos" fill="#2D7FF9" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(entry: unknown) => chartClick(entry)} />}</BarChart></ResponsiveContainer></div></section>
      <section className="panel chart-panel nature-panel"><div className="panel-title"><div><div className="title-with-help"><h2>Natureza da atuação</h2><HelpTip title="Natureza da atuação">Agrupa as providências por tipo de atuação. Passe o cursor sobre uma fatia para conferir a composição.</HelpTip></div><p>Distribuição das providências por tipo de atuação</p></div></div><div className="chart-box pie-box">{actions.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={actions} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={3}>{actions.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip content={<NatureTooltip />} /></PieChart></ResponsiveContainer> : <div className="empty-chart branded-empty compact"><img src="/brand/empty-analytics.webp" alt="" /><strong>Ainda não há dados suficientes</strong></div>}</div><div className="nature-legend">{actions.map((item, index) => <div key={item.name}><i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} /><span>{item.name}</span><b>{item.value}</b><em>{item.percentage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</em></div>)}</div></section></div>

    <section className="panel annual-comparison-panel"><div className="panel-title comparison-title"><div><h2>Comparativo anual</h2><p>{comparisonMode === "same" ? `Mesmo período de cada ano, até ${cutoffLabel}` : "Anos completos disponíveis"}</p></div><label className="year-control">Comparação<select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value as "same" | "full")}><option value="same">Mesmo período</option><option value="full">Ano completo</option></select></label></div><div className="annual-layout"><div className="annual-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={yearly}><CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" /><XAxis dataKey="year" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="total" name="Recebidos" fill="#8CC6FF" radius={[4,4,0,0]} /><Bar dataKey="sent" name="Enviados" fill="#2D7FF9" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div><div className="annual-table-wrap"><table className="annual-table"><thead><tr><th>Ano</th><th>Total</th><th>Diligências/<br />medidas</th><th>Desnecessária<br />intervenção</th><th>Ciência</th><th>Intervenções</th><th>Tempo médio</th><th>Variação</th></tr></thead><tbody>{yearly.map((item) => <tr key={item.year}><td><strong>{item.year}</strong></td><td>{item.total}</td><td>{item.diligence}</td><td>{item.unnecessary}</td><td>{item.science}</td><td>{item.interventions}</td><td>{formatElapsedTime(item.averageHours)}</td><td className={item.variation !== null && item.variation < 0 ? "negative" : "positive"}>{item.variation === null ? "—" : `${item.variation > 0 ? "+" : ""}${item.variation.toFixed(1)}%`}</td></tr>)}</tbody></table></div></div></section>

    <section className="panel"><div className="panel-title"><div><h2>Prioridades da fila</h2><p>Ordenadas pelo prazo mais próximo · tempo médio atual: {formatElapsedTime(averageHours)}</p></div><DatabaseZap size={19} /></div>{priorityRecords.length ? <div className="compact-list">{priorityRecords.map((record) => <button type="button" className="compact-row compact-row-button" key={record.movementId} onClick={() => openPreset({ kind: "pending", label: "Pendentes" })}><div className={`priority-dot ${record.priority.toLowerCase()}`} /><div className="grow"><strong>{record.judicialNumber}</strong><span>{record.subject}</span></div><div className="right"><strong>{record.deadlineAt ? formatDate(record.deadlineAt) : "Sem prazo"}</strong><span>{record.deadlineAt ? `${daysUntil(record.deadlineAt)} dias` : "não aplicável"}</span></div></button>)}</div> : <div className="branded-empty"><img src="/brand/empty-processes.webp" alt="" /><strong>Nenhum processo por aqui</strong><span>Quando houver pendências, elas aparecerão nesta lista.</span></div>}</section>
  </div>;
}
