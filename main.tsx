import { useMemo, useState } from "react";
import { Activity, Clock3, Gauge, Send, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatElapsedTime } from "../date";
import type { ProcessMovement, TeamMember } from "../types";
import { StatCard } from "./StatCard";

interface Props { records: ProcessMovement[]; members: TeamMember[]; currentUserId: string; isAdmin: boolean; }
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function pct(value: number, base: number) { return base ? `${(value / base * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"; }

export function EfficiencyPage({ records, members, currentUserId, isAdmin }: Props) {
  const thirtyDaysAgo = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.getTime();
  }, []);
  const years = useMemo(() => [...new Set(records.map((item) => Number(item.receivedAt.slice(0, 4))).filter(Number.isFinite))].sort((a, b) => b - a), [records]);
  const [year, setYear] = useState(String(years[0] ?? new Date().getFullYear()));
  const [scope, setScope] = useState(currentUserId);
  const base = useMemo(() => records.filter((item) => (!year || item.receivedAt.startsWith(year)) && (scope === "team" || item.assignedTo === scope)), [records, scope, year]);
  const sent = base.filter((item) => item.workflowStatus === "Enviado" && item.sentAt);
  const hours = sent.map((item) => item.elapsedHours).filter((value): value is number => value != null);
  const mean = hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : 0;
  const sameDay = sent.filter((item) => item.sentAt?.slice(0, 10) === item.receivedAt.slice(0, 10)).length;
  const withinTwo = hours.filter((value) => value <= 2).length;
  const monthly = MONTHS.map((month, index) => {
    const received = base.filter((item) => Number(item.receivedAt.slice(5, 7)) === index + 1);
    const completed = received.filter((item) => item.workflowStatus === "Enviado");
    const elapsed = completed.map((item) => item.elapsedHours).filter((value): value is number => value != null);
    return { month, recebidos: received.length, enviados: completed.length, mediana: elapsed.length ? Number(median(elapsed).toFixed(1)) : 0 };
  });
  const load = members.filter((item) => item.active).map((member) => ({
    name: member.fullName || member.email.split("@")[0],
    distribuidos30: records.filter((item) => item.assignedTo === member.userId && new Date(item.receivedAt).getTime() >= thirtyDaysAgo).length,
    pendentes: records.filter((item) => item.assignedTo === member.userId && item.workflowStatus !== "Enviado").length,
  })).sort((a, b) => (b.distribuidos30 + b.pendentes) - (a.distribuidos30 + a.pendentes));
  const comparison = members.filter((item) => item.active).map((member) => {
    const items = records.filter((item) => item.assignedTo === member.userId && (!year || item.receivedAt.startsWith(year)));
    const completed = items.filter((item) => item.workflowStatus === "Enviado" && item.sentAt);
    const elapsed = completed.map((item) => item.elapsedHours).filter((value): value is number => value != null);
    return { member, received: items.length, sent: completed.length, pending: items.length - completed.length, sameDay: completed.filter((item) => item.sentAt?.slice(0, 10) === item.receivedAt.slice(0, 10)).length, median: median(elapsed) };
  });

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">Acompanhamento descritivo</p><h1>Eficiência e carga</h1><p>Indicadores da rotina real, sem meta artificial nem ranking automático.</p></div><div className="dashboard-controls"><label className="year-control">Visão<select value={scope} onChange={(event) => setScope(event.target.value)}><option value={currentUserId}>Meus dados</option><option value="team">Toda a equipe</option></select></label><label className="year-control">Ano<select value={year} onChange={(event) => setYear(event.target.value)}>{years.map((item) => <option key={item}>{item}</option>)}</select></label></div></div>
    <div className="stats-grid efficiency-stats">
      <StatCard label="Mesmo dia" value={pct(sameDay, sent.length)} helper={`${sameDay} de ${sent.length} envios`} icon={Send} tone="green" />
      <StatCard label="Até 2 horas úteis" value={pct(withinTwo, hours.length)} helper={`${withinTwo} de ${hours.length} envios medidos`} icon={Gauge} />
      <StatCard label="Tempo mediano" value={formatElapsedTime(median(hours))} helper="menos sensível a casos excepcionais" icon={Activity} />
      <StatCard label="Tempo médio" value={formatElapsedTime(mean)} helper="jornada útil estimada de 6 h" icon={Clock3} tone="amber" />
    </div>
    <div className="dashboard-grid efficiency-grid">
      <section className="panel chart-panel wide"><div className="panel-title"><div><h2>Fluxo mensal</h2><p>Recebidos e enviados no ano selecionado</p></div></div><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><LineChart data={monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf0" /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Line type="monotone" dataKey="recebidos" stroke="#9bbbd4" strokeWidth={2} /><Line type="monotone" dataKey="enviados" stroke="#1e6091" strokeWidth={3} /></LineChart></ResponsiveContainer></div></section>
      <section className="panel chart-panel"><div className="panel-title"><div><h2>Distribuição da carga</h2><p>Recebidos nos últimos 30 dias e pendências atuais — visível para todos</p></div><Users size={19} /></div><div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={load} layout="vertical" margin={{ left: 12 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5eaf0" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={105} tick={{ fontSize: 10 }} /><Tooltip /><Legend /><Bar name="Distribuídos nos últimos 30 dias" dataKey="distribuidos30" fill="#1e6091" radius={[0, 4, 4, 0]} /><Bar name="Pendentes atuais" dataKey="pendentes" fill="#2a9d8f" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></section>
    </div>
    {isAdmin && <section className="panel admin-comparison"><div className="panel-title"><div><h2>Comparativo administrativo</h2><p>Detalhamento individual restrito ao administrador.</p></div></div><div className="table-scroll"><table><thead><tr><th>Usuário</th><th>Recebidos</th><th>Enviados</th><th>Pendentes</th><th>Mesmo dia</th><th>Mediana</th></tr></thead><tbody>{comparison.map((item) => <tr key={item.member.userId}><td><strong>{item.member.fullName || item.member.email}</strong></td><td>{item.received}</td><td>{item.sent}</td><td>{item.pending}</td><td>{pct(item.sameDay, item.sent)}</td><td>{formatElapsedTime(item.median)}</td></tr>)}</tbody></table></div></section>}
    <div className="metric-note"><strong>Como ler:</strong> a mediana representa melhor o trabalho cotidiano; a média continua disponível para revelar o peso dos casos excepcionalmente demorados. Horas úteis seguem a jornada estimada de 6 horas por dia e excluem fins de semana e datas configuradas.</div>
  </div>;
}
