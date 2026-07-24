import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarRange, Clock3, Gauge, Info, Send, Users } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import {
  buildEfficiencyModel, formatEfficiencyDuration, localDateKey, percentage,
  type EfficiencyMetric,
} from "../efficiency";
import type { ProcessMovement, TeamMember } from "../types";
import { StatCard } from "./StatCard";

interface Props {
  records: ProcessMovement[];
  members: TeamMember[];
  currentUserId: string;
  isAdmin: boolean;
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

function initialRange() {
  const today = new Date();
  return {
    startDate: localDateKey(new Date(today.getFullYear(), 0, 1, 12)),
    endDate: localDateKey(today),
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function coverageLabel(status: "covered" | "partial" | "unavailable", since: string | null): string {
  if (status === "unavailable") return "Sem dados históricos no período";
  if (status === "partial") return `Cobertura parcial desde ${since ? shortDate(since) : "data não informada"}`;
  return since ? `Histórico disponível desde ${shortDate(since)}` : "Histórico disponível";
}

function abbreviatedName(member: TeamMember): string {
  const value = member.fullName || member.email;
  const words = value.trim().split(/\s+/);
  if (words.length <= 2) return value;
  return `${words[0]} ${words.at(-1)}`;
}

function EmptyHistory() {
  return <div className="efficiency-empty"><Activity size={30} /><strong>Não há dados históricos cadastrados para este usuário no período selecionado.</strong><span>Isso é diferente de um período válido com movimentação igual a zero.</span></div>;
}

export function EfficiencyPage({ records, members, currentUserId, isAdmin }: Props) {
  const today = useMemo(() => new Date(), []);
  const todayKey = localDateKey(today);
  const initial = useMemo(initialRange, []);
  const [scope, setScope] = useState(isAdmin ? "team" : currentUserId);
  const [periodType, setPeriodType] = useState(`year-${today.getFullYear()}`);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [efficiencyMetric, setEfficiencyMetric] = useState<EfficiencyMetric>("sameDay");
  const years = useMemo(() => {
    const recordYears = records.map((record) => Number(record.receivedAt.slice(0, 4))).filter(Number.isFinite);
    return [...new Set([today.getFullYear(), ...recordYears])].sort((a, b) => b - a);
  }, [records, today]);

  function applyPeriod(value: string) {
    setPeriodType(value);
    let start = new Date(today);
    let end = new Date(today);
    if (value === "month") start = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    if (value === "30days") start = addDays(today, -29);
    if (value === "90days") start = addDays(today, -89);
    if (value.startsWith("year-")) {
      const selectedYear = Number(value.slice(5));
      start = new Date(selectedYear, 0, 1, 12);
      end = selectedYear === today.getFullYear() ? new Date(today) : new Date(selectedYear, 11, 31, 12);
    }
    setStartDate(localDateKey(start));
    setEndDate(localDateKey(end));
  }

  const safeScope = isAdmin ? scope : currentUserId;
  const model = useMemo(
    () => buildEfficiencyModel(records, members, safeScope, { startDate, endDate }, todayKey),
    [endDate, members, records, safeScope, startDate, todayKey],
  );
  const currentMember = members.find((member) => member.userId === safeScope);
  const isTeam = safeScope === "team";
  const coverageText = `${model.coverage.covered + model.coverage.partial} de ${model.coverage.total} ${model.coverage.total === 1 ? "usuário com dados" : "usuários com dados"} no período`;
  const metricKey: Record<EfficiencyMetric, keyof typeof model.trend[number]> = {
    sameDay: "sameDayPct",
    withinOneDay: "withinOneDayPct",
    median: "median",
    p90: "p90",
  };
  const efficiencyData = model.trend.filter((point) => !point.future).map((point) => ({
    ...point,
    value: point[metricKey[efficiencyMetric]] as number | null,
  }));
  const historicalEmpty = model.flow == null;

  return <div className="page-stack efficiency-page">
    <div className="page-heading efficiency-heading"><div><p className="eyebrow">Acompanhamento descritivo</p><h1>Eficiência e carga</h1><p>Fluxo, tempo, cobertura e composição do trabalho, sem ranking automático.</p></div>
      <div className="dashboard-controls">
        <label className="year-control">Visão<select value={safeScope} disabled={!isAdmin} onChange={(event) => setScope(event.target.value)}>
          <option value={currentUserId}>Meus dados</option>
          {isAdmin && <option value="team">Toda a equipe</option>}
          {isAdmin && members.filter((member) => member.active && member.userId !== currentUserId).map((member) => <option key={member.userId} value={member.userId}>{member.fullName || member.email}</option>)}
        </select></label>
        <label className="year-control">Período<select value={periodType} onChange={(event) => applyPeriod(event.target.value)}>
          <option value="month">Mês atual</option><option value="30days">Últimos 30 dias</option><option value="90days">Últimos 90 dias</option>
          {years.map((year) => <option key={year} value={`year-${year}`}>{year === today.getFullYear() ? `${year} até hoje` : `Ano de ${year}`}</option>)}
          <option value="custom">Personalizado</option>
        </select></label>
      </div>
    </div>

    <section className="efficiency-context" aria-label="Escopo e cobertura">
      <div><strong>{isTeam ? "Visão: Toda a equipe" : safeScope === currentUserId ? "Visão: Meus dados" : "Visão: Usuário selecionado"}</strong><span>{isTeam ? `Usuários considerados: ${model.scopeMembers.length}` : `Responsável: ${currentMember?.fullName || currentMember?.email || "Não identificado"}`}</span></div>
      <div><strong>Período efetivo</strong><span>{shortDate(startDate)} a {shortDate(endDate)}{endDate === todayKey ? " · período em andamento" : ""}</span></div>
      <div className={model.coverage.isComplete ? "coverage-ok" : "coverage-warning"}><strong>Cobertura histórica</strong><span>{coverageText}</span></div>
    </section>

    {periodType === "custom" && <div className="efficiency-date-controls"><label>Data inicial<input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>Data final<input type="date" value={endDate} min={startDate} max={todayKey} onChange={(event) => setEndDate(event.target.value)} /></label></div>}
    {!model.coverage.isComplete && <div className="coverage-notice"><AlertTriangle size={18} /><span>Os totais deste período não representam toda a equipe, pois parte dos usuários ainda não possuía histórico cadastrado. Ausência de histórico não é contabilizada como zero.</span></div>}

    {historicalEmpty ? <EmptyHistory /> : <>
      <div className="section-label"><span>Fluxo</span><small>Movimentações no período; pendências representam a situação atual.</small></div>
      <div className="stats-grid efficiency-flow-stats">
        <StatCard label="Recebidos" value={String(model.flow!.received)} helper={model.flow!.received === 1 ? "1 processo recebido" : `${model.flow!.received} processos recebidos`} icon={Send} />
        <StatCard label="Enviados" value={String(model.flow!.sent)} helper={model.flow!.sent === 1 ? "1 processo enviado" : `${model.flow!.sent} processos enviados`} icon={Send} tone="green" />
        <StatCard label="Saldo do período" value={String(model.flow!.balance)} helper="recebidos menos enviados; não é o estoque real" icon={Gauge} tone="amber" />
        <StatCard label="Pendentes atuais" value={String(model.flow!.currentPending)} helper="situação atual, independente do período" icon={AlertTriangle} />
      </div>

      <div className="section-label"><span>Tempo de tramitação</span><small>Horas úteis seguem a jornada configurada de 6 horas.</small></div>
      <div className="stats-grid efficiency-time-stats">
        <StatCard label="Mesmo dia" value={percentage(model.time!.sameDay, model.time!.sentCount)} helper={`${model.time!.sameDay} de ${model.time!.sentCount} envios`} icon={Send} tone="green" />
        <StatCard label="Até 2 horas úteis" value={percentage(model.time!.withinTwoHours, model.time!.preciseCount)} helper={`${model.time!.preciseCount} de ${model.time!.sentCount} envios com horário disponível`} icon={Gauge} />
        <StatCard label="Tempo mediano" value={formatEfficiencyDuration(model.time!.median, model.time)} helper={model.time!.measuredCount ? `${model.time!.measuredCount} medições válidas` : "Não há medições suficientes"} icon={Activity} />
        <StatCard label="P90" value={formatEfficiencyDuration(model.time!.p90, model.time)} helper="90% dos envios ocorreram até este tempo" icon={Clock3} tone="amber" />
      </div>

      <div className="dashboard-grid efficiency-grid">
        <section className="panel chart-panel wide"><div className="panel-title"><div><h2>Fluxo mensal</h2><p>Recebidos, enviados e estoque ao fim de cada mês. O mês atual é parcial.</p></div><CalendarRange size={19} /></div>
          <div className="chart-box efficiency-flow-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={model.trend} margin={{ top: 24, right: 22, left: 0, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf0" /><XAxis dataKey="label" tickLine={false} axisLine={false} tickFormatter={(value, index) => model.trend[index]?.partial ? `${value}*` : value} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip formatter={(value, name) => [value ?? "Mês futuro", name]} labelFormatter={(label, payload) => `${label}${payload?.[0]?.payload?.partial ? " · mês parcial" : ""}`} /><Legend /><Bar name="Recebidos" dataKey="received" fill="#9bbbd4" radius={[4, 4, 0, 0]} /><Bar name="Enviados" dataKey="sent" fill="#1e6091" radius={[4, 4, 0, 0]} /><Line name="Estoque final" type="monotone" dataKey="stock" connectNulls={false} stroke="#b88a24" strokeWidth={3} dot={{ r: 4, fill: "#fff", strokeWidth: 2 }} /></ComposedChart></ResponsiveContainer></div>
          {model.trend.length > 0 && model.trend.filter((point) => !point.future).every((point) => point.stock === 0) && <p className="chart-observation">O estoque permaneceu zerado durante todo o período.</p>}
        </section>

        <section className="panel chart-panel wide"><div className="panel-title"><div><h2>Evolução da eficiência</h2><p>Uma métrica por vez, sem misturar percentuais e horas no mesmo eixo.</p></div><Activity size={19} /></div>
          <div className="metric-selector" role="group" aria-label="Métrica de eficiência">{[
            ["sameDay", "Mesmo dia"], ["withinOneDay", "Até 1 dia útil"], ["median", "Mediana"], ["p90", "P90"],
          ].map(([value, label]) => <button key={value} className={efficiencyMetric === value ? "active" : ""} onClick={() => setEfficiencyMetric(value as EfficiencyMetric)}>{label}</button>)}</div>
          <div className="chart-box efficiency-evolution-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={efficiencyData} margin={{ top: 18, right: 22, left: 8, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf0" /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} unit={efficiencyMetric === "sameDay" || efficiencyMetric === "withinOneDay" ? "%" : " h"} /><Tooltip formatter={(value, _name, item) => [value == null ? "Não disponível" : efficiencyMetric === "sameDay" || efficiencyMetric === "withinOneDay" ? `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : formatEfficiencyDuration(Number(value)), `Valor · ${item.payload.validMeasurements} medições, ${item.payload.preciseMeasurements} com horário`]} /><Line type="monotone" dataKey="value" connectNulls={false} stroke="#2a9d8f" strokeWidth={3} dot={{ r: 4 }} /></ComposedChart></ResponsiveContainer></div>
        </section>
      </div>
    </>}

    <div className="section-label"><span>Situação atual da equipe e distribuição</span><small>Estes blocos são independentes do período histórico selecionado.</small></div>
    <div className="dashboard-grid efficiency-load-grid">
      <section className="panel chart-panel"><div className="panel-title"><div><h2>Distribuição recente</h2><p>Processos recebidos nos últimos 30 dias, por usuário.</p></div><Users size={19} /></div>
        <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={model.load} layout="vertical" margin={{ left: 16, right: 40 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5eaf0" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey={(row) => abbreviatedName(row.member)} width={125} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={(_label, payload) => payload?.[0]?.payload?.member?.fullName || payload?.[0]?.payload?.member?.email} formatter={(value, _name, item) => [`${value} · ${item.payload.recentShare.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, "Recebidos"]} /><Bar name="Recebidos nos últimos 30 dias" dataKey="recentReceived" fill="#1e6091" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
      </section>
      <section className="panel chart-panel"><div className="panel-title"><div><h2>Pendências atuais</h2><p>Dentro do prazo e vencidas, independentes do ano histórico.</p></div><AlertTriangle size={19} /></div>
        <div className="chart-box"><ResponsiveContainer width="100%" height="100%"><BarChart data={model.load} layout="vertical" margin={{ left: 16, right: 24 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5eaf0" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey={(row) => abbreviatedName(row.member)} width={125} tick={{ fontSize: 11 }} /><Tooltip labelFormatter={(_label, payload) => payload?.[0]?.payload?.member?.fullName || payload?.[0]?.payload?.member?.email} formatter={(value, name, item) => [`${value}${item.payload.oldestPendingDays != null ? ` · mais antiga: ${item.payload.oldestPendingDays} dias` : ""}`, name]} /><Legend /><Bar name="Dentro do prazo/sem prazo" stackId="pending" dataKey="pendingOnTime" fill="#2a9d8f" /><Bar name="Vencidas" stackId="pending" dataKey="pendingOverdue" fill="#be4237" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
      </section>
    </div>

    {!historicalEmpty && <section className="panel composition-panel"><div className="panel-title"><div><h2>Composição da carga</h2><p>Natureza dos processos recebidos no período; não constitui pontuação de produtividade.</p></div></div>
      <div className="chart-box composition-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={model.composition} margin={{ top: 12, right: 20, bottom: 12, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eaf0" /><XAxis dataKey={(row) => abbreviatedName(row.member)} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip labelFormatter={(_label, payload) => payload?.[0]?.payload?.member?.fullName || payload?.[0]?.payload?.member?.email} /><Legend /><Bar name="Comuns" stackId="composition" dataKey="common" fill="#9bbbd4" /><Bar name="Relevância social" stackId="composition" dataKey="social" fill="#2a9d8f" /><Bar name="Alta complexidade" stackId="composition" dataKey="complex" fill="#b88a24" /><Bar name="Ambas" stackId="composition" dataKey="both" fill="#744c9e" /></BarChart></ResponsiveContainer></div>
    </section>}

    {isAdmin && <section className="panel admin-comparison"><div className="panel-title"><div><h2>Comparativo administrativo</h2><p>Ordenação alfabética; ausência histórica não é preenchida com zeros.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Usuário</th><th>Cobertura histórica</th><th>Recebidos</th><th>Enviados</th><th>Saldo</th><th>Pendentes atuais</th><th>Vencidas</th><th>Mesmo dia</th><th>Até 1 dia útil</th><th>Mediana</th><th>P90</th></tr></thead>
        <tbody>{model.rows.sort((a, b) => (a.member.fullName || a.member.email).localeCompare(b.member.fullName || b.member.email, "pt-BR")).map((row) => <tr key={row.member.userId}><td><strong>{row.member.fullName || row.member.email}</strong></td><td>{coverageLabel(row.coverage.status, row.coverage.since)}</td>{row.flow && row.time ? <><td>{row.flow.received}</td><td>{row.flow.sent}</td><td>{row.flow.balance}</td><td>{row.flow.currentPending}</td><td className={row.pendingOverdue ? "overdue-value" : ""}>{row.pendingOverdue}</td><td>{percentage(row.time.sameDay, row.time.sentCount)}</td><td>{percentage(row.time.withinOneDay, row.time.preciseCount)}</td><td>{formatEfficiencyDuration(row.time.median, row.time)}</td><td>{formatEfficiencyDuration(row.time.p90, row.time)}</td></> : <td colSpan={9} className="no-history-cell">Sem dados históricos cadastrados para este período</td>}</tr>)}</tbody>
      </table></div>
    </section>}

    {isAdmin && model.comparable && <section className="panel comparable-panel"><div className="panel-title"><div><h2>Comparação com período equivalente</h2><p>Equipe comparável: somente usuários com cobertura nos dois períodos.</p></div><Info size={19} /></div>
      <p><strong>{model.comparable.members.length} {model.comparable.members.length === 1 ? "usuário comparável" : "usuários comparáveis"}</strong> · Atual: {shortDate(model.comparable.currentRange.startDate)} a {shortDate(model.comparable.currentRange.endDate)} · Anterior: {shortDate(model.comparable.previousRange.startDate)} a {shortDate(model.comparable.previousRange.endDate)}</p>
      <div className="comparison-summary"><span>Recebidos: <strong>{model.comparable.previous.received} → {model.comparable.current.received}</strong></span><span>Enviados: <strong>{model.comparable.previous.sent} → {model.comparable.current.sent}</strong></span><span>Saldo: <strong>{model.comparable.previous.balance} → {model.comparable.current.balance}</strong></span></div>
    </section>}

    <div className="metric-note"><strong>Notas metodológicas:</strong> “Mesmo dia” usa as datas de recebimento e envio. “Até 2 horas” e “Até 1 dia útil” usam apenas registros com horário suficientemente preciso. A mediana e o P90 reutilizam as horas úteis do Práxis; registros importados apenas com data podem indicar “Mesmo dia útil”, sem afirmar duração exata em horas. Pendências atuais e distribuição dos últimos 30 dias não mudam com o filtro histórico.</div>
  </div>;
}
