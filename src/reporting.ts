import { actionLabel } from "./labels";
import { inspectDataQuality } from "./dataQuality";
import type { ProcessMovement, TeamMember } from "./types";

export const WORKDAY_HOURS = 6;
export const DEFAULT_NEAR_DUE_DAYS = 3;

export type ReportMode = "executive" | "complete" | "highlights";
export type ReportScope = "team" | string;
export type HighlightFilter = "all" | "social" | "complex" | "both";
export type DeadlineStatus = "completedOnTime" | "completedLate" | "pendingOnTime" | "pendingNear" | "pendingOverdue" | "noDeadline";

export interface ReportFilters {
  startDate: string;
  endDate: string;
  scope: ReportScope;
  className: string;
  actionType: string;
  highlight: HighlightFilter;
  nearDueDays?: number;
}

export interface DistributionStats {
  count: number;
  mean: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  min: number | null;
  max: number | null;
  sameBusinessDay: number;
  withinOneBusinessDay: number;
  withinThreeBusinessDays: number;
  zeroSameDate: number;
  withoutCompleteTime: number;
}

export interface DeadlineBreakdown {
  completedOnTime: number;
  completedLate: number;
  pendingOnTime: number;
  pendingNear: number;
  pendingOverdue: number;
  noDeadline: number;
  completedApplicable: number;
  applicable: number;
  completionCompliance: number | null;
  currentConformity: number | null;
}

export interface FlowMetrics {
  initialStock: number;
  received: number;
  sent: number;
  balance: number;
  finalStock: number;
  reconciliationDifference: number;
  sentReceivedRatio: number | null;
}

export interface UserReportMetrics extends FlowMetrics {
  userId: string;
  name: string;
  deadline: DeadlineBreakdown;
  transit: DistributionStats;
  common: number;
  socialOnly: number;
  complexOnly: number;
  both: number;
  classes: Array<{ label: string; value: number }>;
  actions: Array<{ label: string; value: number }>;
  qualityIssues: number;
  qualityChecked: number;
}

export interface FlowPoint { label: string; startDate: string; endDate: string; received: number; sent: number; stock: number; }
export interface CategoryMetric { label: string; value: number; percentage: number; }
export type CategoryPresentation = "empty" | "single" | "insight" | "chart";

export interface ReportModel {
  filters: ReportFilters;
  scopedRecords: ProcessMovement[];
  population: ProcessMovement[];
  highlightedProcesses: ProcessMovement[];
  flow: FlowMetrics;
  deadline: DeadlineBreakdown;
  transit: DistributionStats;
  users: UserReportMetrics[];
  trend: FlowPoint[];
  actions: CategoryMetric[];
  classes: CategoryMetric[];
  highlights: { socialOnly: number; complexOnly: number; both: number; socialTotal: number; complexTotal: number; total: number };
  relevance: {
    reach: CategoryMetric[];
    territory: CategoryMetric[];
    impact: CategoryMetric[];
    rights: CategoryMetric[];
    groups: CategoryMetric[];
    themes: CategoryMetric[];
    sdgs: CategoryMetric[];
  };
  synthesis: string;
  warnings: string[];
}

export interface ReportScopeInfo {
  kind: "individual" | "team";
  title: string;
  responsibleName: string | null;
  usersConsidered: number;
}

function dateKey(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function parseDateKey(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function addDays(value: string, days: number): string {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sentDate(record: ProcessMovement): string {
  return record.workflowStatus === "Enviado" ? dateKey(record.sentAt) : "";
}

function isReceivedBy(record: ProcessMovement, boundary: string): boolean {
  const received = dateKey(record.receivedAt);
  return Boolean(received && received <= boundary);
}

function isPendingAt(record: ProcessMovement, boundary: string): boolean {
  if (!isReceivedBy(record, boundary)) return false;
  const sent = sentDate(record);
  return !sent || sent > boundary;
}

function inRange(value: string, start: string, end: string): boolean {
  return Boolean(value && value >= start && value <= end);
}

function foldText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

function matchesFilters(record: ProcessMovement, filters: ReportFilters): boolean {
  if (filters.scope !== "team" && record.assignedTo !== filters.scope) return false;
  if (filters.className && filters.className !== "all" && record.className !== filters.className) return false;
  if (filters.actionType && filters.actionType !== "all" && actionLabel(record.actionType) !== filters.actionType) return false;
  if (filters.highlight === "social" && !record.sociallyRelevant) return false;
  if (filters.highlight === "complex" && !record.extremelyComplex) return false;
  if (filters.highlight === "both" && !(record.sociallyRelevant && record.extremelyComplex)) return false;
  return true;
}

export function scopedReportRecords(records: ProcessMovement[], filters: ReportFilters): ProcessMovement[] {
  return records.filter((record) => !record.deletedAt && matchesFilters(record, filters));
}

export function uniqueProcesses(records: ProcessMovement[]): ProcessMovement[] {
  const result = new Map<number, ProcessMovement>();
  [...records].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.movementId - a.movementId)
    .forEach((record) => { if (!result.has(record.caseId)) result.set(record.caseId, record); });
  return [...result.values()];
}

export function calculateFlow(records: ProcessMovement[], startDate: string, endDate: string): FlowMetrics {
  const initialStock = records.filter((record) => dateKey(record.receivedAt) < startDate && isPendingAt(record, addDays(startDate, -1))).length;
  const received = records.filter((record) => inRange(dateKey(record.receivedAt), startDate, endDate)).length;
  const sent = records.filter((record) => inRange(sentDate(record), startDate, endDate) && isReceivedBy(record, endDate)).length;
  const finalStockObserved = records.filter((record) => isPendingAt(record, endDate)).length;
  const reconciledFinalStock = initialStock + received - sent;
  return {
    initialStock,
    received,
    sent,
    balance: received - sent,
    finalStock: reconciledFinalStock,
    reconciliationDifference: finalStockObserved - reconciledFinalStock,
    sentReceivedRatio: received ? sent / received * 100 : null,
  };
}

function deadlineStatus(record: ProcessMovement, endDate: string, nearDueDays: number, completed: boolean): DeadlineStatus {
  const deadline = dateKey(record.deadlineAt);
  if (!deadline) return "noDeadline";
  if (completed) return sentDate(record) <= deadline ? "completedOnTime" : "completedLate";
  if (deadline < endDate) return "pendingOverdue";
  if (deadline <= addDays(endDate, nearDueDays)) return "pendingNear";
  return "pendingOnTime";
}

export function calculateDeadlines(records: ProcessMovement[], startDate: string, endDate: string, nearDueDays = DEFAULT_NEAR_DUE_DAYS): DeadlineBreakdown {
  const result: DeadlineBreakdown = {
    completedOnTime: 0, completedLate: 0, pendingOnTime: 0, pendingNear: 0, pendingOverdue: 0, noDeadline: 0,
    completedApplicable: 0, applicable: 0, completionCompliance: null, currentConformity: null,
  };
  const completed = records.filter((record) => inRange(sentDate(record), startDate, endDate));
  const pending = records.filter((record) => isPendingAt(record, endDate));
  [...completed.map((record) => [record, true] as const), ...pending.map((record) => [record, false] as const)].forEach(([record, isCompleted]) => {
    const status = deadlineStatus(record, endDate, nearDueDays, isCompleted);
    result[status] += 1;
  });
  result.completedApplicable = result.completedOnTime + result.completedLate;
  result.applicable = result.completedApplicable + result.pendingOnTime + result.pendingNear + result.pendingOverdue;
  result.completionCompliance = result.completedApplicable ? result.completedOnTime / result.completedApplicable * 100 : null;
  result.currentConformity = result.applicable ? (result.completedOnTime + result.pendingOnTime + result.pendingNear) / result.applicable * 100 : null;
  return result;
}

export function percentile(values: number[], probability: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction;
}

export function calculateDistribution(records: ProcessMovement[], startDate: string, endDate: string): DistributionStats {
  const completed = records.filter((record) => inRange(sentDate(record), startDate, endDate));
  const measured = completed.filter((record) => record.elapsedHours != null && Number.isFinite(record.elapsedHours));
  const values = measured.map((record) => record.elapsedHours as number);
  return {
    count: values.length,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    median: percentile(values, .5), p75: percentile(values, .75), p90: percentile(values, .9),
    min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
    sameBusinessDay: measured.filter((record) => dateKey(record.receivedAt) === sentDate(record)).length,
    withinOneBusinessDay: values.filter((value) => value <= WORKDAY_HOURS).length,
    withinThreeBusinessDays: values.filter((value) => value <= WORKDAY_HOURS * 3).length,
    zeroSameDate: measured.filter((record) => record.elapsedHours === 0 && dateKey(record.receivedAt) === sentDate(record)).length,
    withoutCompleteTime: measured.filter((record) => !hasCompleteTime(record.receivedAt) || !hasCompleteTime(record.sentAt)).length,
  };
}

function hasCompleteTime(value: string | null | undefined): boolean {
  return Boolean(value && /T\d{2}:\d{2}/.test(value) && !/T00:00(?::00)?(?:[Z+-]|$)/.test(value));
}

function countCategories(values: string[], denominator: number): CategoryMetric[] {
  const counts = new Map<string, number>();
  values.map((value) => value.trim()).filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].map(([label, value]) => ({ label, value, percentage: denominator ? value / denominator * 100 : 0 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));
}

export function pluralize(count: number, singular: string, plural: string): string { return count === 1 ? singular : plural; }

function summaryText(flow: FlowMetrics, deadline: DeadlineBreakdown, social: number, complex: number): string {
  const compliance = deadline.completionCompliance == null
    ? "não houve processos concluídos com prazo aplicável"
    : `${deadline.completionCompliance.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% dos processos concluídos com prazo aplicável foram enviados tempestivamente`;
  const pending = flow.finalStock;
  const socialText = `${social} ${pluralize(social, "processo socialmente relevante", "processos socialmente relevantes")}`;
  const complexText = `${complex} ${pluralize(complex, "processo de alta complexidade", "processos de alta complexidade")}`;
  return `No período selecionado, ${flow.received} ${pluralize(flow.received, "processo foi recebido", "processos foram recebidos")} e ${flow.sent} ${pluralize(flow.sent, "foi enviado", "foram enviados")}, encerrando o intervalo com ${pending} ${pluralize(pending, "pendência", "pendências")}. ${compliance.charAt(0).toUpperCase()}${compliance.slice(1)}. Foram identificados ${socialText} e ${complexText}.`;
}

function periodPopulation(records: ProcessMovement[], startDate: string, endDate: string): ProcessMovement[] {
  return records.filter((record) => inRange(dateKey(record.receivedAt), startDate, endDate) || inRange(sentDate(record), startDate, endDate) || isPendingAt(record, endDate));
}

function userMetrics(records: ProcessMovement[], member: TeamMember, filters: ReportFilters): UserReportMetrics {
  const items = records.filter((record) => record.assignedTo === member.userId);
  const population = periodPopulation(items, filters.startDate, filters.endDate);
  const cases = uniqueProcesses(population);
  const flow = calculateFlow(items, filters.startDate, filters.endDate);
  const quality = inspectDataQuality(population);
  return {
    userId: member.userId,
    name: member.fullName || member.email,
    ...flow,
    deadline: calculateDeadlines(items, filters.startDate, filters.endDate, filters.nearDueDays),
    transit: calculateDistribution(items, filters.startDate, filters.endDate),
    common: cases.filter((item) => !item.sociallyRelevant && !item.extremelyComplex).length,
    socialOnly: cases.filter((item) => item.sociallyRelevant && !item.extremelyComplex).length,
    complexOnly: cases.filter((item) => !item.sociallyRelevant && item.extremelyComplex).length,
    both: cases.filter((item) => item.sociallyRelevant && item.extremelyComplex).length,
    classes: countCategories(population.map((item) => item.className), population.length).map(({ label, value }) => ({ label, value })),
    actions: countCategories(population.map((item) => actionLabel(item.actionType)), population.length).map(({ label, value }) => ({ label, value })),
    qualityIssues: quality.length,
    qualityChecked: population.length,
  };
}

function bucketLabel(start: string, end: string, type: "day" | "week" | "month"): string {
  const format = (value: string) => new Intl.DateTimeFormat("pt-BR", type === "month" ? { month: "short", year: "2-digit" } : { day: "2-digit", month: "2-digit" }).format(parseDateKey(value));
  return type === "day" ? format(start) : type === "week" ? `${format(start)}–${format(end)}` : format(start).replace(" de ", "/");
}

export function buildFlowTrend(records: ProcessMovement[], startDate: string, endDate: string): FlowPoint[] {
  const days = Math.round((parseDateKey(endDate).getTime() - parseDateKey(startDate).getTime()) / 86_400_000) + 1;
  const type: "day" | "week" | "month" = days <= 31 ? "day" : days < 90 ? "week" : "month";
  const buckets: Array<{ start: string; end: string }> = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    let bucketEnd = cursor;
    if (type === "week") bucketEnd = addDays(cursor, 6);
    if (type === "month") {
      const date = parseDateKey(cursor);
      bucketEnd = localDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
    }
    if (bucketEnd > endDate) bucketEnd = endDate;
    buckets.push({ start: cursor, end: bucketEnd });
    cursor = addDays(bucketEnd, 1);
  }
  return buckets.map((bucket) => ({
    label: bucketLabel(bucket.start, bucket.end, type), startDate: bucket.start, endDate: bucket.end,
    received: records.filter((record) => inRange(dateKey(record.receivedAt), bucket.start, bucket.end)).length,
    sent: records.filter((record) => inRange(sentDate(record), bucket.start, bucket.end)).length,
    stock: records.filter((record) => isPendingAt(record, bucket.end)).length,
  }));
}

export function buildReportModel(records: ProcessMovement[], members: TeamMember[], filters: ReportFilters): ReportModel {
  if (!filters.startDate || !filters.endDate || filters.startDate > filters.endDate) throw new Error("Período inválido para o relatório.");
  const scoped = scopedReportRecords(records, filters);
  const population = periodPopulation(scoped, filters.startDate, filters.endDate);
  const cases = uniqueProcesses(population);
  const highlighted = cases.filter((item) => item.sociallyRelevant || item.extremelyComplex);
  const social = cases.filter((item) => item.sociallyRelevant);
  const complex = cases.filter((item) => item.extremelyComplex);
  const flow = calculateFlow(scoped, filters.startDate, filters.endDate);
  const deadline = calculateDeadlines(scoped, filters.startDate, filters.endDate, filters.nearDueDays);
  const activeMembers = members.filter((member) => member.active && (filters.scope === "team" || member.userId === filters.scope));
  const actionValues = population.map((item) => actionLabel(item.actionType));
  const warnings: string[] = [];
  if (flow.reconciliationDifference) warnings.push(`A conciliação encontrou diferença de ${flow.reconciliationDifference} ${pluralize(Math.abs(flow.reconciliationDifference), "registro", "registros")}, normalmente causada por dados históricos sem data de envio coerente.`);
  if (population.some((item) => item.workflowStatus === "Enviado" && !item.sentAt)) warnings.push("Há registros marcados como enviados sem data de envio; eles não entram nas métricas temporais.");
  const socialDenominator = social.length;
  const splitMulti = (values: string[]) => values.flatMap((value) => value.split(/[;,]/).map((item) => item.trim()).filter(Boolean));
  return {
    filters,
    scopedRecords: scoped,
    population,
    highlightedProcesses: highlighted,
    flow,
    deadline,
    transit: calculateDistribution(scoped, filters.startDate, filters.endDate),
    users: activeMembers.map((member) => userMetrics(scoped, member, filters)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    trend: buildFlowTrend(scoped, filters.startDate, filters.endDate),
    actions: countCategories(actionValues, actionValues.length),
    classes: countCategories(population.map((item) => item.className), population.length),
    highlights: {
      socialOnly: cases.filter((item) => item.sociallyRelevant && !item.extremelyComplex).length,
      complexOnly: cases.filter((item) => !item.sociallyRelevant && item.extremelyComplex).length,
      both: cases.filter((item) => item.sociallyRelevant && item.extremelyComplex).length,
      socialTotal: social.length, complexTotal: complex.length, total: highlighted.length,
    },
    relevance: {
      reach: countCategories(social.map((item) => item.reach), socialDenominator),
      territory: countCategories(social.map((item) => item.territorialScope), socialDenominator),
      impact: countCategories(social.map((item) => item.impactType), socialDenominator),
      rights: countCategories(splitMulti(social.map((item) => item.fundamentalRight)), socialDenominator),
      groups: countCategories(splitMulti(social.map((item) => item.affectedGroup)), socialDenominator),
      themes: countCategories(splitMulti(social.map((item) => item.socialTheme)), socialDenominator),
      sdgs: countCategories(social.flatMap((item) => [...new Set(item.sdgs)]), socialDenominator),
    },
    synthesis: summaryText(flow, deadline, social.length, complex.length),
    warnings,
  };
}

export function reportFilterDescription(filters: ReportFilters, members: TeamMember[]): string[] {
  const member = members.find((item) => item.userId === filters.scope);
  return [
    `Período: ${filters.startDate} a ${filters.endDate}`,
    `Escopo: ${filters.scope === "team" ? "equipe inteira" : member?.fullName || member?.email || "usuário específico"}`,
    `Classe: ${filters.className === "all" ? "todas" : filters.className}`,
    `Providência: ${filters.actionType === "all" ? "todas" : filters.actionType}`,
    `Classificação: ${{ all: "todas", social: "relevância social", complex: "alta complexidade", both: "ambas" }[filters.highlight]}`,
  ];
}

export function normalizeCategory(value: string): string { return foldText(value); }

export function categoryPresentation(data: CategoryMetric[], freeText = false): CategoryPresentation {
  if (!data.length) return "empty";
  if (data.length === 1) return "single";
  if (freeText && data.filter((item) => item.value > 1).length < 2) return "insight";
  return "chart";
}

export function reportScopeInfo(model: ReportModel, members: TeamMember[]): ReportScopeInfo {
  if (model.filters.scope === "team") {
    return {
      kind: "team",
      title: "Relatório da equipe",
      responsibleName: null,
      usersConsidered: model.users.length,
    };
  }
  const member = members.find((item) => item.userId === model.filters.scope);
  return {
    kind: "individual",
    title: "Relatório individual",
    responsibleName: member?.fullName || member?.email || model.users[0]?.name || "Usuário não identificado",
    usersConsidered: 1,
  };
}

function safeInitials(value: string): string {
  const withoutAccents = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = withoutAccents.match(/[A-Za-z0-9]+/g) ?? [];
  if (!words.length) return "usuario";
  const initials = words.map((word) => word[0]).join("").toLowerCase();
  return initials.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-") || "usuario";
}

export function buildReportFileName(mode: ReportMode, model: ReportModel, members: TeamMember[]): string {
  const prefix: Record<ReportMode, string> = {
    executive: "praxis-relatorio-executivo",
    complete: "praxis-relatorio-completo",
    highlights: "praxis-anexo-processos-destacados",
  };
  const scope = reportScopeInfo(model, members);
  const scopePart = scope.kind === "team" ? "equipe" : safeInitials(scope.responsibleName ?? "");
  return `${prefix[mode]}-${scopePart}-${model.filters.startDate}-a-${model.filters.endDate}.pdf`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}
