export const PRAXIS_TIME_ZONE = "America/Belem";
const PRAXIS_OFFSET = "-03:00";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function zonedParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: PRAXIS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const parts = zonedParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
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
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: PRAXIS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime && timePrecise ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
  }).format(date);
}

export function formatElapsedTime(hours: number | null): string {
  if (hours === null) return "—";
  if (hours <= 8) return `${hours.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
  const days = hours / 6;
  return `${days.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${days < 1.05 ? "dia útil" : "dias úteis"}`;
}

function localNoon(value: string): Date {
  return new Date(`${value}T12:00:00${PRAXIS_OFFSET}`);
}

function isUsefulDayKey(value: string, excludedDates: ReadonlySet<string>): boolean {
  const weekday = localNoon(value).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !excludedDates.has(value);
}

export function usefulElapsedHours(receivedAt: string, sentAt: string | null, excludedDates: ReadonlySet<string> = new Set()): number | null {
  if (!receivedAt || !sentAt) return null;
  const start = new Date(receivedAt);
  const end = new Date(sentAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) return 0;

  const elapsed = (end.getTime() - start.getTime()) / 3_600_000;
  const startKey = localDatePart(receivedAt);
  const endKey = localDatePart(sentAt);

  if (elapsed < 24) {
    return isUsefulDayKey(startKey, excludedDates) ? Math.max(0, elapsed - 18) : 0;
  }

  let usefulHours = 0;
  const cursor = localNoon(startKey);
  const endDay = localNoon(endKey);
  while (cursor < endDay) {
    const key = `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(cursor.getUTCDate())}`;
    if (isUsefulDayKey(key, excludedDates)) usefulHours += 6;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (isUsefulDayKey(endKey, excludedDates)) {
    const parts = zonedParts(end);
    const endHour = Number(parts.hour) + Number(parts.minute) / 60 + Number(parts.second) / 3600;
    usefulHours += Math.min(6, Math.max(0, endHour));
  }

  return usefulHours;
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
    const utcDays = Math.floor(value - 25569);
    const base = new Date(utcDays * 86_400_000);
    const seconds = Math.round((((value % 1) + 1) % 1) * 86_400) % 86_400;
    date = new Date(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60);
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

  return { value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`, precise: explicitTime };
}

export function excelDateToIso(value: unknown): string {
  return excelDateTime(value).value;
}
