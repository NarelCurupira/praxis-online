export const PRAXIS_TIME_ZONE = "America/Belem";
const PRAXIS_OFFSET = "-03:00";
const MAX_LOCAL_DATE_CACHE = 20_000;

export interface WorkdaySchedule {
  workdayStart: string;
  workdayEnd: string;
  workdayHours: number;
}

const DEFAULT_WORKDAY_SCHEDULE: WorkdaySchedule = {
  workdayStart: "08:00",
  workdayEnd: "14:00",
  workdayHours: 6,
};

let activeWorkdaySchedule: WorkdaySchedule = { ...DEFAULT_WORKDAY_SCHEDULE };

const ZONED_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: PRAXIS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: PRAXIS_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: PRAXIS_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const localDateCache = new Map<string, string>();

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function zonedParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    ZONED_PARTS_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]),
  );
}

function rememberLocalDate(source: string, value: string): string {
  if (localDateCache.size >= MAX_LOCAL_DATE_CACHE) localDateCache.clear();
  localDateCache.set(source, value);
  return value;
}

function validClock(value: string, fallback: string): string {
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

export function configureWorkdaySchedule(
  settings: Partial<WorkdaySchedule> | null | undefined,
): void {
  const start = validClock(settings?.workdayStart ?? "", DEFAULT_WORKDAY_SCHEDULE.workdayStart);
  const end = validClock(settings?.workdayEnd ?? "", DEFAULT_WORKDAY_SCHEDULE.workdayEnd);
  const hours = Number(settings?.workdayHours);

  activeWorkdaySchedule = {
    workdayStart: start,
    workdayEnd: end,
    workdayHours: Number.isFinite(hours) && hours > 0
      ? hours
      : DEFAULT_WORKDAY_SCHEDULE.workdayHours,
  };
}

export function toLocalInput(date = new Date()): string {
  const parts = zonedParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function toStorageTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  let normalized = trimmed;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    normalized = `${trimmed}T00:00:00${PRAXIS_OFFSET}`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) {
    normalized = `${trimmed}${trimmed.length === 16 ? ":00" : ""}${PRAXIS_OFFSET}`;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function localDatePart(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return value.slice(0, 10);

  const cached = localDateCache.get(value);
  if (cached !== undefined) return cached;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return rememberLocalDate(value, value.slice(0, 10));

  const parts = zonedParts(date);
  return rememberLocalDate(value, `${parts.year}-${parts.month}-${parts.day}`);
}

export function addDays(value: string, days: number): string {
  const timestamp = toStorageTimestamp(value);
  const date = timestamp ? new Date(timestamp) : new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return toLocalInput(date);
}

export function addBusinessDays(value: string, days: number, excludedDates: string[] = []): string {
  const timestamp = toStorageTimestamp(value);
  const date = timestamp ? new Date(timestamp) : new Date();
  const excluded = new Set(excludedDates);
  let remaining = Math.max(0, Math.trunc(days));

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const localKey = localDatePart(date.toISOString());
    const weekday = new Date(`${localKey}T12:00:00${PRAXIS_OFFSET}`).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !excluded.has(localKey)) remaining -= 1;
  }

  return toLocalInput(date);
}

export function formatDate(value: string | null, includeTime = false, timePrecise = true): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return includeTime && timePrecise
    ? DATE_TIME_FORMATTER.format(date)
    : DATE_FORMATTER.format(date);
}

export function formatElapsedTime(hours: number | null): string {
  if (hours === null) return "—";
  if (hours <= Math.max(8, activeWorkdaySchedule.workdayHours)) {
    return `${hours.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} h`;
  }

  const days = hours / activeWorkdaySchedule.workdayHours;
  return `${days.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} ${days < 1.05 ? "dia útil" : "dias úteis"}`;
}

function localNoon(value: string): Date {
  return new Date(`${value}T12:00:00${PRAXIS_OFFSET}`);
}

function isUsefulDayKey(value: string, excludedDates: ReadonlySet<string>): boolean {
  const weekday = localNoon(value).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !excludedDates.has(value);
}

function workdayInstant(dateKey: string, clock: string): Date {
  return new Date(`${dateKey}T${clock}:00${PRAXIS_OFFSET}`);
}

function dateKeyOrdinal(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function usefulDaysInclusive(
  startKey: string,
  endKey: string,
  excludedDates: ReadonlySet<string>,
): number {
  const startOrdinal = dateKeyOrdinal(startKey);
  const endOrdinal = dateKeyOrdinal(endKey);
  if (!Number.isFinite(startOrdinal) || !Number.isFinite(endOrdinal) || endOrdinal < startOrdinal) return 0;

  const totalDays = endOrdinal - startOrdinal + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  let usefulDays = fullWeeks * 5;
  const remainder = totalDays % 7;
  const startWeekday = localNoon(startKey).getUTCDay();

  // No máximo seis iterações, independentemente da duração do processo.
  for (let offset = 0; offset < remainder; offset += 1) {
    const weekday = (startWeekday + offset) % 7;
    if (weekday !== 0 && weekday !== 6) usefulDays += 1;
  }

  for (const excludedDate of excludedDates) {
    if (excludedDate < startKey || excludedDate > endKey) continue;
    const excludedOrdinal = dateKeyOrdinal(excludedDate);
    if (!Number.isFinite(excludedOrdinal)) continue;
    const weekday = localNoon(excludedDate).getUTCDay();
    if (weekday !== 0 && weekday !== 6) usefulDays -= 1;
  }

  return Math.max(0, usefulDays);
}

function usefulIntersection(
  dateKey: string,
  intervalStart: number,
  intervalEnd: number,
  excludedDates: ReadonlySet<string>,
): number {
  if (!isUsefulDayKey(dateKey, excludedDates)) return 0;
  const workStart = workdayInstant(dateKey, activeWorkdaySchedule.workdayStart).getTime();
  const workEnd = workdayInstant(dateKey, activeWorkdaySchedule.workdayEnd).getTime();
  if (workEnd <= workStart) return 0;
  return Math.max(0, Math.min(intervalEnd, workEnd) - Math.max(intervalStart, workStart));
}

/**
 * Calcula apenas a interseção real entre o período de tramitação e o
 * expediente configurado. Horas noturnas, fins de semana, feriados e
 * recessos não entram no resultado.
 */
export function usefulElapsedHours(
  receivedAt: string,
  sentAt: string | null,
  excludedDates: ReadonlySet<string> = new Set(),
): number | null {
  if (!receivedAt || !sentAt) return null;

  const start = new Date(receivedAt);
  const end = new Date(sentAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) return 0;

  const startKey = localDatePart(receivedAt);
  const endKey = localDatePart(sentAt);
  if (!startKey || !endKey) return null;

  if (startKey === endKey) {
    return usefulIntersection(startKey, start.getTime(), end.getTime(), excludedDates) / 3_600_000;
  }

  const workStart = workdayInstant(startKey, activeWorkdaySchedule.workdayStart).getTime();
  const workEnd = workdayInstant(startKey, activeWorkdaySchedule.workdayEnd).getTime();
  const workdayMilliseconds = Math.max(0, workEnd - workStart);
  let usefulMilliseconds = usefulDaysInclusive(startKey, endKey, excludedDates) * workdayMilliseconds;

  if (isUsefulDayKey(startKey, excludedDates)) {
    usefulMilliseconds -= workdayMilliseconds;
    usefulMilliseconds += usefulIntersection(startKey, start.getTime(), Number.POSITIVE_INFINITY, excludedDates);
  }

  if (isUsefulDayKey(endKey, excludedDates)) {
    usefulMilliseconds -= workdayMilliseconds;
    usefulMilliseconds += usefulIntersection(endKey, Number.NEGATIVE_INFINITY, end.getTime(), excludedDates);
  }

  return usefulMilliseconds / 3_600_000;
}

export function daysUntil(value: string): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const end = localNoon(localDatePart(value));
  const now = localNoon(localDatePart(new Date().toISOString()));
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

export interface SpreadsheetDateTime {
  value: string;
  precise: boolean;
}

function parseTimeValue(value: unknown): { hour: number; minute: number; second: number } | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return { hour: value.getHours(), minute: value.getMinutes(), second: value.getSeconds() };
  if (typeof value === "number") {
    const fraction = ((value % 1) + 1) % 1;
    const seconds = Math.round(fraction * 86_400) % 86_400;
    return { hour: Math.floor(seconds / 3600), minute: Math.floor((seconds % 3600) / 60), second: seconds % 60 };
  }
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  return hour <= 23 && minute <= 59 && second <= 59 ? { hour, minute, second } : null;
}

export function excelDateTime(value: unknown, separateTime?: unknown): SpreadsheetDateTime {
  let date: Date | null = null;
  let explicitTime = false;

  if (value instanceof Date) {
    date = new Date(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds());
    explicitTime = value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0;
  } else if (typeof value === "number") {
    const wholeDays = Math.floor(value);
    let seconds = Math.round((value - wholeDays) * 86_400);
    let dayOffset = wholeDays;

    if (seconds >= 86_400) {
      seconds -= 86_400;
      dayOffset += 1;
    }

    const base = new Date(Date.UTC(1899, 11, 30) + dayOffset * 86_400_000);
    date = new Date(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      Math.floor(seconds / 3600),
      Math.floor((seconds % 3600) / 60),
      seconds % 60,
    );
    explicitTime = seconds !== 0;
  } else if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    const brazilian = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (brazilian) {
      const [, day, month, year, hour, minute, second] = brazilian;
      date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour ?? 0), Number(minute ?? 0), Number(second ?? 0));
      explicitTime = hour !== undefined;
    } else {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed;
        explicitTime = /[T\s]\d{1,2}:\d{2}/.test(text);
      }
    }
  }

  if (!date || Number.isNaN(date.getTime())) return { value: "", precise: false };

  const separate = parseTimeValue(separateTime);
  if (separate) {
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), separate.hour, separate.minute, separate.second);
    explicitTime = true;
  }

  return {
    value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    precise: explicitTime,
  };
}

export function excelDateToIso(value: unknown): string {
  return excelDateTime(value).value;
}
