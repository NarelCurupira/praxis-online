import { WORKDAY_HOURS, percentile } from "./reporting";
import type { ProcessMovement, TeamMember } from "./types";

export type EfficiencyScope = "team" | string;
export type CoverageStatus = "covered" | "partial" | "unavailable";
export type EfficiencyMetric = "sameDay" | "withinOneDay" | "median" | "p90";

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface CoverageResult {
  status: CoverageStatus;
  since: string | null;
}

export interface EfficiencyTimeMetrics {
  sentCount: number;
  measuredCount: number;
  preciseCount: number;
  sameDay: number;
  withinTwoHours: number;
  withinOneDay: number;
  median: number | null;
  mean: number | null;
  p90: number | null;
}

export interface EfficiencyFlow {
  received: number;
  sent: number;
  balance: number;
  currentPending: number;
}

export interface EfficiencyUserRow {
  member: TeamMember;
  coverage: CoverageResult;
  flow: EfficiencyFlow | null;
  time: EfficiencyTimeMetrics | null;
  pendingOverdue: number;
}

export interface EfficiencyTrendPoint {
  key: string;
  label: string;
  partial: boolean;
  future: boolean;
  received: number | null;
  sent: number | null;
  stock: number | null;
  sameDayPct: number | null;
  withinOneDayPct: number | null;
  median: number | null;
  p90: number | null;
  validMeasurements: number;
  preciseMeasurements: number;
}

export interface ComparableSummary {
  members: TeamMember[];
  current: EfficiencyFlow;
  previous: EfficiencyFlow;
  currentRange: DateRange;
  previousRange: DateRange;
}

export interface LoadRow {
  member: TeamMember;
  recentReceived: number;
  recentShare: number;
  pending: number;
  pendingOverdue: number;
  pendingOnTime: number;
  oldestPendingDays: number | null;
}

export interface CompositionRow {
  member: TeamMember;
  common: number;
  social: number;
  complex: number;
  both: number;
}

export interface EfficiencyModel {
  range: DateRange;
  scope: EfficiencyScope;
  scopeMembers: TeamMember[];
  coverage: {
    covered: number;
    partial: number;
    unavailable: number;
    total: number;
    isComplete: boolean;
  };
  selectedRecords: ProcessMovement[];
  flow: EfficiencyFlow | null;
  time: EfficiencyTimeMetrics | null;
  trend: EfficiencyTrendPoint[];
  rows: EfficiencyUserRow[];
  load: LoadRow[];
  composition: CompositionRow[];
  comparable: ComparableSummary | null;
}

export function dateKey(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return localDateKey(parsed);

  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
}

export function hasCompleteTime(value: string | null | undefined): boolean {
  if (!value || !/T\d{2}:\d{2}/.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  // Datas importadas sem horário são normalizadas para meia-noite local e
  // permanecem fora das métricas que dependem de precisão horária.
  return parsed.getHours() !== 0 || parsed.getMinutes() !== 0 || parsed.getSeconds() !== 0;
}

function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value: string, days: number): string {
  const result = parseDate(value);
  result.setDate(result.getDate() + days);
  return localDateKey(result);
}

export function previousEquivalentRange(range: DateRange): DateRange {
  const shift = (value: string) => {
    const current = parseDate(value);
    const targetYear = current.getFullYear() - 1;
    const lastDay = new Date(targetYear, current.getMonth() + 1, 0).getDate();
    return localDateKey(new Date(targetYear, current.getMonth(), Math.min(current.getDate(), lastDay), 12));
  };
  return { startDate: shift(range.startDate), endDate: shift(range.endDate) };
}

export function coverageFor(member: TeamMember, range: DateRange): CoverageResult {
  const since = dateKey(member.historicalCoverageSince) || null;
  if (!since || since > range.endDate) return { status: "unavailable", since };
  if (since > range.startDate) return { status: "partial", since };
  return { status: "covered", since };
}

function sentDate(record: ProcessMovement): string {
  return record.workflowStatus === "Enviado" ? dateKey(record.sentAt) : "";
}

function inRange(value: string, range: DateRange): boolean {
  return Boolean(value && value >= range.startDate && value <= range.endDate);
}

function pendingAt(record: ProcessMovement, boundary: string): boolean {
  const received = dateKey(record.receivedAt);
  const sent = sentDate(record);
  return Boolean(received && received <= boundary && (!sent || sent > boundary));
}

export function calculateEfficiencyFlow(records: ProcessMovement[], range: DateRange, currentDate: string): EfficiencyFlow {
  const received = records.filter((record) => inRange(dateKey(record.receivedAt), range)).length;
  const sent = records.filter((record) => inRange(sentDate(record), range)).length;
  return {
    received,
    sent,
    balance: received - sent,
    currentPending: records.filter((record) => pendingAt(record, currentDate)).length,
  };
}

export function calculateEfficiencyTime(records: ProcessMovement[], range: DateRange): EfficiencyTimeMetrics {
  const sent = records.filter((record) => inRange(sentDate(record), range));
  const measured = sent.filter((record) => record.elapsedHours != null && Number.isFinite(record.elapsedHours));
  const precise = measured.filter((record) => hasCompleteTime(record.receivedAt) && hasCompleteTime(record.sentAt));
  const values = measured.map((record) => record.elapsedHours as number);
  const preciseValues = precise.map((record) => record.elapsedHours as number);
  return {
    sentCount: sent.length,
    measuredCount: measured.length,
    preciseCount: precise.length,
    sameDay: sent.filter((record) => dateKey(record.receivedAt) === sentDate(record)).length,
    withinTwoHours: preciseValues.filter((value) => value <= 2).length,
    withinOneDay: preciseValues.filter((value) => value <= WORKDAY_HOURS).length,
    median: percentile(values, .5),
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    p90: percentile(values, .9),
  };
}

function monthBuckets(range: DateRange, today: string): Array<{ start: string; end: string; key: string; label: string; partial: boolean; future: boolean }> {
  const start = parseDate(range.startDate);
  const end = parseDate(range.endDate);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
  const result = [];
  while (cursor <= end) {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
    const bucketStart = localDateKey(first) < range.startDate ? range.startDate : localDateKey(first);
    const bucketEnd = localDateKey(last) > range.endDate ? range.endDate : localDateKey(last);
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const currentMonth = today.slice(0, 7) === key;
    result.push({
      start: bucketStart,
      end: bucketEnd,
      key,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(cursor).replace(" de ", "/"),
      partial: currentMonth || bucketStart !== localDateKey(first) || bucketEnd !== localDateKey(last),
      future: bucketStart > today,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

function buildTrend(records: ProcessMovement[], range: DateRange, today: string): EfficiencyTrendPoint[] {
  return monthBuckets(range, today).map((bucket) => {
    if (bucket.future) return {
      key: bucket.key, label: bucket.label, partial: false, future: true,
      received: null, sent: null, stock: null, sameDayPct: null, withinOneDayPct: null,
      median: null, p90: null, validMeasurements: 0, preciseMeasurements: 0,
    };
    const bucketRange = { startDate: bucket.start, endDate: bucket.end > today ? today : bucket.end };
    const flow = calculateEfficiencyFlow(records, bucketRange, bucketRange.endDate);
    const time = calculateEfficiencyTime(records, bucketRange);
    return {
      key: bucket.key,
      label: bucket.label,
      partial: bucket.partial,
      future: false,
      received: flow.received,
      sent: flow.sent,
      stock: records.filter((record) => pendingAt(record, bucketRange.endDate)).length,
      sameDayPct: time.sentCount ? time.sameDay / time.sentCount * 100 : null,
      withinOneDayPct: time.preciseCount ? time.withinOneDay / time.preciseCount * 100 : null,
      median: time.median,
      p90: time.p90,
      validMeasurements: time.measuredCount,
      preciseMeasurements: time.preciseCount,
    };
  });
}

function activeScopeMembers(members: TeamMember[], scope: EfficiencyScope): TeamMember[] {
  return members.filter((member) => member.active && (scope === "team" || member.userId === scope));
}

function recordsForMembers(records: ProcessMovement[], members: TeamMember[]): ProcessMovement[] {
  const ids = new Set(members.map((member) => member.userId));
  return records.filter((record) => !record.deletedAt && ids.has(record.assignedTo));
}

function effectiveCoverageSince(records: ProcessMovement[], member: TeamMember): string | null {
  const configured = dateKey(member.historicalCoverageSince);
  const inferred = recordsForMembers(records, [member])
    .map((record) => dateKey(record.receivedAt))
    .filter(Boolean)
    .sort()[0] ?? "";

  if (!configured) return inferred || null;
  if (!inferred) return configured;

  // A configuração administrativa não pode ocultar movimentações existentes.
  return configured <= inferred ? configured : inferred;
}

function coverageForRecords(records: ProcessMovement[], member: TeamMember, range: DateRange): CoverageResult {
  return coverageFor(
    { ...member, historicalCoverageSince: effectiveCoverageSince(records, member) },
    range,
  );
}

function historicalRecordsForMembers(records: ProcessMovement[], members: TeamMember[]): ProcessMovement[] {
  return members.flatMap((member) => {
    const since = effectiveCoverageSince(records, member) ?? "";
    return recordsForMembers(records, [member]).filter((record) => !since || dateKey(record.receivedAt) >= since);
  });
}

function comparableSummary(records: ProcessMovement[], members: TeamMember[], currentRange: DateRange, today: string): ComparableSummary | null {
  const previousRange = previousEquivalentRange(currentRange);
  const comparable = members.filter((member) =>
    coverageForRecords(records, member, currentRange).status === "covered"
    && coverageForRecords(records, member, previousRange).status === "covered");
  if (!comparable.length) return null;
  const comparableRecords = recordsForMembers(records, comparable);
  return {
    members: comparable,
    current: calculateEfficiencyFlow(comparableRecords, currentRange, today),
    previous: calculateEfficiencyFlow(comparableRecords, previousRange, previousRange.endDate),
    currentRange,
    previousRange,
  };
}

export function buildEfficiencyModel(
  records: ProcessMovement[],
  members: TeamMember[],
  scope: EfficiencyScope,
  range: DateRange,
  today = localDateKey(new Date()),
): EfficiencyModel {
  const scopeMembers = activeScopeMembers(members, scope);
  const coverageItems = scopeMembers.map((member) => coverageForRecords(records, member, range));
  const includedMembers = scopeMembers.filter((member) => coverageForRecords(records, member, range).status !== "unavailable");
  const selectedRecords = historicalRecordsForMembers(records, includedMembers);
  const rows = scopeMembers.map((member): EfficiencyUserRow => {
    const coverage = coverageForRecords(records, member, range);
    const allMemberRecords = recordsForMembers(records, [member]);
    const memberRecords = historicalRecordsForMembers(records, [member]);
    const pending = allMemberRecords.filter((record) => pendingAt(record, today));
    return {
      member,
      coverage,
      flow: coverage.status === "unavailable" ? null : calculateEfficiencyFlow(memberRecords, range, today),
      time: coverage.status === "unavailable" ? null : calculateEfficiencyTime(memberRecords, range),
      pendingOverdue: pending.filter((record) => dateKey(record.deadlineAt) && dateKey(record.deadlineAt) < today).length,
    };
  });
  const thirtyDaysAgo = addDays(today, -29);
  const allActive = members.filter((member) => member.active);
  const recentTotal = records.filter((record) => !record.deletedAt && dateKey(record.receivedAt) >= thirtyDaysAgo && dateKey(record.receivedAt) <= today).length;
  const load = allActive.map((member): LoadRow => {
    const memberRecords = recordsForMembers(records, [member]);
    const recentReceived = memberRecords.filter((record) => dateKey(record.receivedAt) >= thirtyDaysAgo && dateKey(record.receivedAt) <= today).length;
    const pending = memberRecords.filter((record) => pendingAt(record, today));
    const oldest = pending.map((record) => dateKey(record.receivedAt)).filter(Boolean).sort()[0];
    return {
      member,
      recentReceived,
      recentShare: recentTotal ? recentReceived / recentTotal * 100 : 0,
      pending: pending.length,
      pendingOverdue: pending.filter((record) => dateKey(record.deadlineAt) && dateKey(record.deadlineAt) < today).length,
      pendingOnTime: pending.filter((record) => !dateKey(record.deadlineAt) || dateKey(record.deadlineAt) >= today).length,
      oldestPendingDays: oldest ? Math.max(0, Math.floor((parseDate(today).getTime() - parseDate(oldest).getTime()) / 86_400_000)) : null,
    };
  }).sort((a, b) => a.member.fullName.localeCompare(b.member.fullName, "pt-BR"));
  const composition = scopeMembers.map((member): CompositionRow => {
    const memberCases = new Map<number, ProcessMovement>();
    historicalRecordsForMembers(records, [member]).filter((record) => inRange(dateKey(record.receivedAt), range)).forEach((record) => memberCases.set(record.caseId, record));
    const cases = [...memberCases.values()];
    return {
      member,
      common: cases.filter((record) => !record.sociallyRelevant && !record.extremelyComplex).length,
      social: cases.filter((record) => record.sociallyRelevant && !record.extremelyComplex).length,
      complex: cases.filter((record) => !record.sociallyRelevant && record.extremelyComplex).length,
      both: cases.filter((record) => record.sociallyRelevant && record.extremelyComplex).length,
    };
  });
  const covered = coverageItems.filter((item) => item.status === "covered").length;
  const partial = coverageItems.filter((item) => item.status === "partial").length;
  const unavailable = coverageItems.filter((item) => item.status === "unavailable").length;
  const hasHistoricalScope = includedMembers.length > 0;
  return {
    range,
    scope,
    scopeMembers,
    coverage: { covered, partial, unavailable, total: scopeMembers.length, isComplete: unavailable === 0 && partial === 0 },
    selectedRecords,
    flow: hasHistoricalScope ? calculateEfficiencyFlow(selectedRecords, range, today) : null,
    time: hasHistoricalScope ? calculateEfficiencyTime(selectedRecords, range) : null,
    trend: hasHistoricalScope ? buildTrend(selectedRecords, range, today) : [],
    rows,
    load,
    composition,
    comparable: comparableSummary(records, scopeMembers, range, today),
  };
}

export function formatEfficiencyDuration(value: number | null, time?: EfficiencyTimeMetrics | null): string {
  if (value == null) return "Não disponível";
  if (value === 0) return time?.sameDay ? "Mesmo dia útil" : "Não disponível";
  const formatted = value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (value < WORKDAY_HOURS) return `${formatted} ${value < 1.05 ? "h útil" : "h úteis"}`;
  const days = value / WORKDAY_HOURS;
  return `${formatted} h úteis — ${days.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${days < 1.05 ? "dia útil" : "dias úteis"}`;
}

export function percentage(value: number, denominator: number): string {
  return denominator
    ? `${(value / denominator * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
    : "Não disponível";
}
