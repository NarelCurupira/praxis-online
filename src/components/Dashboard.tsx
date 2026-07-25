import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Files, Send } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { daysUntil, formatDate, formatElapsedTime } from "../date";
import { actionLabel } from "../labels";
import { summarizeActionGroups, type ActionGroupSummary } from "../actionGroups";
import type { ProcessMovement } from "../types";
import { HelpTip } from "./HelpTip";
import { StatCard } from "./StatCard";

interface Props { records: ProcessMovement[]; currentUserId: string; currentUserName: string; isAdmin: boolean; }
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const PIE_COLORS = ["#1e6091", "#2a9d8f", "#e9a23b", "#6c63a8", "#718096"];

function NatureTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: ActionGroupSummary }> }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return <div className="nature-tooltip"><strong>{item.name}</strong><span>{item.value} processos · {item.percentage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span><div>{item.details.map((detail) => <p key={detail.name}><b>{detail.name}</b><em>{detail.value}</em></p>)}</div></div>;
}

export function Dashboard({ records, currentUserId, currentUserName }: Props) {
  const todayLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  const [selectedAssignee, setSelectedAssignee] = useState(currentUserId);
  const scopedRecords = useMemo(() => selectedAssignee === "Todos" ? records : records.filter((record) => record.assignedTo === selectedAssignee), [records, selectedAssignee]);
  const years = useMemo(() => [...new Set<number>(scopedRecords.map((record) => new Date(record.receivedAt).getFullYear()).filter(Number.isFinite))].sort((a, b) => b - a), [scopedRecords]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [comparisonMode, setComparisonMode] = useState<"same" | "full">("same");
  useEffect(() => {
    if (!years.length) { setSelectedPeriod("Todos"); return; }
    const isSpecialPeriod = selectedPeriod === "MesAtual" || selectedPeriod === "Ultimos30";
    if (!selectedPeriod || (!isSpecialPeriod && selectedPeriod !== "Todos" && !years.includes(Number(selectedPeriod)))) setSelectedPeriod(String(years[0]));
  }, [years, selectedPeriod]);
  const filteredRecords = useMemo(() => {
    const now = new Date(); const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    if (selectedPeriod === "MesAtual") return scopedRecords.filter((record) => { const date = new Date(`${record.receivedAt.slice(0, 10)}T12:00:00`); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); });
    if (selectedPeriod === "Ultimos30") { const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 29); return scopedRecords.filter((record) => { const date = new Date(`${record.receivedAt.slice(0, 10)}T12:00:00`); return date >= start && date <= todayEnd; }); }
    if (selectedPeriod && selectedPeriod !== "Todos") return scopedRecords.filter((record) => new Date(record.receivedAt).getFullYear() === Number(selectedPeriod));
    return scopedRecords;
  }, [scopedRecords, selectedPeriod]);
  const pending = filteredRecords.filter((record) => record.workflowStatus !== "Enviado");
  const sent = filteredRecords.filter((record) => record.workflowStatus === "Enviado");
  const urgent = pending.filter((record) => daysUntil(record.deadlineAt) <= 3);
  const measuredSent = sent.filter((record) => record.receivedTimePrecise === true && record.sentTimePrecise === true && record.elapsedHours !== null && Number.isFinite(record.elapsedHours));
  const elapsed = measuredSent.map((record) => record.elapsedHours as number);
  const averageHours = elapsed.length ? elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length : null;
  const monthlyAll = MONTHS.map((month, index) => ({ month, recebidos: filteredRecords.filter((record) => new Date(record.receivedAt).getMonth() === index).length, enviados: sent.filter((record) => record.sentAt && new Date(record.sentAt).getMonth() === index).length }));
  const monthly = selectedPeriod === "MesAtual" ? [monthlyAll[new Date().getMonth()]] : selectedPeriod === "Ultimos30" ? monthlyAll.filter((item) => item.recebidos || item.enviados) : monthlyAll;
  const actions = useMemo(() => summarizeActionGroups(filteredRecords.map((record) => actionLabel(record.actionType))), [filteredRecords]);
  const periodLabel = selectedPeriod === "MesAtual" ? "Mês atual" : selectedPeriod === "Ultimos30" ? "Últimos 30 dias" : selectedPeriod;
  const priorityRecords = [...pending].sort((a, b) => daysUntil(a.deadlineAt) - daysUntil(b.deadlineAt)).slice(0, 6);
  const latestYear = years[0];
  const latestYearDates = scopedRecords.filter((record) => new Date(record.receivedAt).getFullYear() === latestYear).map((record) => new Date(record.receivedAt)).filter((date) => !Number.isNaN(date.getTime()));
  const cutoffDate = latestYearDates.length ? new Date(Math.max(...latestYearDates.map((date) => date.getTime()))) : new Date();
  const cutoffKey = (cutoffDate.getMonth() + 1) * 100 + cutoffDate.getDate();
  const cutoffLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(cutoffDate);
  const recordsForYear = (year: number) => scopedRecords.filter((record) => { const date = new Date(record.receivedAt); return date.getFullYear() === year && (comparisonMode === "full" || (date.getMonth() + 1) * 100 + date.getDate() <= cutoffKey); });
  const yearly = [...years].reverse().map((year, index, allYears) => {
    const items = recordsForYear(year); const yearSent = items.filter((record) => record.workflowStatus === "Enviado");
    const hours = yearSent.filter((record) => record.receivedTimePrecise === true && record.sentTimePrecise === true).map((record) => record.elapsedHours).filter((value): value is number => value !== null && Number.isFinite(value));
    const grouped = summarizeActionGroups(items.map((record) => actionLabel(record.actionType)));
    const count = (name: string) => grouped.find((item) => item.name === name)?.value ?? 0;
    const previousYear = allYears[index - 1]; const previousTotal = previousYear ? recordsForYear(previousYear).length : 0;
    return { year, total: items.length, sent: yearSent.length, diligence: count("Diligências e medidas processuais"), unnecessary: count("Desnecessária intervenção"), science: count("Ciência"), interventions: count("Intervenção"), averageHours: hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : null, variation: previousTotal ? (items.length / previousTotal - 1) * 100 : null };
  });

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">{todayLabel}</p><h1>Visão geral</h1><p>{selectedAssignee === "Todos" ? "Acompanhe a fila, os prazos e a produção de toda a equipe." : "Acompanhe sua fila, seus prazos e sua produção."}</p></div><div className="dashboard-controls"><label className="year-control">Responsável<select value={selectedAssignee} onChange={(event) => setSelectedAssignee(event.target.value)}><option value={currentUserId}>{currentUserName || "Meus dados"}</option><option value="Todos">Todos os usuários</option></select></label><label className="year-control">Período<select value={selectedPeriod || "Todos"} onChange={(event) => setSelectedPeriod(event.target.value)}><option value="MesAtual">Mês atual</option><option value="Ultimos30">Últimos 30 dias</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}<option value="Todos">Todos</option></select></label></div></div>
    <div className="stats-grid"><StatCard label="Na caixa" value={pending.length} helper="processos pendentes" icon={Files} /><StatCard label="Prazos próximos" value={urgent.length} helper="até 3 dias" icon={AlertTriangle} tone="red" /><StatCard label="Enviados" value={sent.length} helper="registros concluídos" icon={CheckCircle2} tone="green" /><StatCard label="Tempo médio" value={averageHours === null ? "Não disponível" : formatElapsedTime(averageHours)} helper={measuredSent.length ? `${measuredSent.length} envios com horários completos` : "sem envios com horários completos"} icon={Clock3} tone="amber" /></div>
    <div className="dashboard-grid"><section className="panel chart-panel wide"><div className="panel-title"><div><h2>Movimentação mensal{periodLabel && periodLabel !== "Todos" ? ` — ${periodLabel}` : ""}</h2><p>Entradas e envios no período selecionado</p></div><Send size={19} /></div><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly} barGap={4}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf0" /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="recebidos" fill="#9bbbd4" radius={[4, 4, 0, 0]} /><Bar dataKey="enviados" fill="#1e6091" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
      <section className="panel chart-panel nature-panel"><div className="panel-title"><div><div className="title-with-help"><h2>Natureza da atuação</h2><HelpTip title="Natureza da atuação">Agrupa as providências em intervenção, desnecessária intervenção, diligências e medidas processuais e ciência. Passe o cursor sobre uma fatia para conferir a composição.</HelpTip></div><p>Distribuição das providências por tipo de atuação</p></div></div><div className="chart-box pie-box">{actions.length ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={actions} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={3}>{actions.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip content={<NatureTooltip />} /></PieChart></ResponsiveContainer> : <div className="empty-chart">Sem dados importados</div>}</div><div className="nature-legend">{actions.map((item, index) => <div key={item.name}><i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} /><span>{item.name}</span><b>{item.value}</b><em>{item.percentage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</em></div>)}</div></section></div>
    <section className="panel"><div className="panel-title comparison-title"><div><h2>Comparativo anual</h2><p>{comparisonMode === "same" ? `Mesmo período de cada ano, até ${cutoffLabel}` : "Anos completos disponíveis"}</p></div><label className="year-control">Comparação<select value={comparisonMode} onChange={(event) => setComparisonMode(event.target.value as "same" | "full")}><option value="same">Mesmo período</option><option value="full">Ano completo</option></select></label></div><div className="annual-layout"><div className="annual-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={yearly}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf0" /><XAxis dataKey="year" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="total" name="Recebidos" fill="#9bbbd4" radius={[4,4,0,0]} /><Bar dataKey="sent" name="Enviados" fill="#1e6091" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div><div className="annual-table-wrap"><table className="annual-table"><thead><tr><th>Ano</th><th>Total</th><th>Diligências/<br />medidas</th><th>Desnecessária<br />intervenção</th><th>Ciência</th><th>Intervenções</th><th>Tempo médio</th><th>Variação</th></tr></thead><tbody>{yearly.map((item) => <tr key={item.year}><td><strong>{item.year}</strong></td><td>{item.total}</td><td>{item.diligence}</td><td>{item.unnecessary}</td><td>{item.science}</td><td>{item.interventions}</td><td>{formatElapsedTime(item.averageHours)}</td><td className={item.variation !== null && item.variation < 0 ? "negative" : "positive"}>{item.variation === null ? "—" : `${item.variation > 0 ? "+" : ""}${item.variation.toFixed(1)}%`}</td></tr>)}</tbody></table></div></div></section>
    <section className="panel"><div className="panel-title"><div><h2>Prioridades da fila</h2><p>Ordenadas pelo prazo mais próximo</p></div></div>{priorityRecords.length ? <div className="compact-list">{priorityRecords.map((record) => <div className="compact-row" key={record.movementId}><div className={`priority-dot ${record.priority.toLowerCase()}`} /><div className="grow"><strong>{record.judicialNumber}</strong><span>{record.subject}</span></div><div className="right"><strong>{record.deadlineAt ? formatDate(record.deadlineAt) : "Sem prazo"}</strong><span>{record.deadlineAt ? `${daysUntil(record.deadlineAt)} dias` : "não aplicável"}</span></div></div>)}</div> : <div className="empty-state">Importe sua planilha ou cadastre o primeiro processo.</div>}</section>
  </div>;
}
