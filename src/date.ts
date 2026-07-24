export function toLocalInput(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toStorageTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function addDays(value: string, days: number): string {
  const date = value ? new Date(value) : new Date();
  date.setDate(date.getDate() + days);
  return toLocalInput(date);
}

export function addBusinessDays(value: string, days: number, excludedDates: string[] = []): string {
  const date = value ? new Date(value) : new Date();
  const excluded = new Set(excludedDates);
  let remaining = Math.max(0, Math.trunc(days));
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const weekday = date.getDay();
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (weekday !== 0 && weekday !== 6 && !excluded.has(dateKey)) remaining -= 1;
  }
  return toLocalInput(date);
}

export function formatDate(value: string | null, includeTime = false): string {
  if (!value) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  const hasMeaningfulTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime && !dateOnly && hasMeaningfulTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function formatElapsedTime(hours: number | null): string {
  if (hours === null) return "—";
  if (hours <= 8) return `${hours.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
  const days = hours / 6;
  return `${days.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${days < 1.05 ? "dia útil" : "dias úteis"}`;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isUsefulDay(date: Date, excludedDates: ReadonlySet<string>): boolean {
  return date.getDay() !== 0 && date.getDay() !== 6 && !excludedDates.has(localDateKey(date));
}

export function usefulElapsedHours(receivedAt: string, sentAt: string | null, excludedDates: ReadonlySet<string> = new Set()): number | null {
  if (!receivedAt || !sentAt) return null;

  const start = new Date(receivedAt);
  const end = new Date(sentAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= start.getTime()) return 0;

  const elapsed = (end.getTime() - start.getTime()) / 3_600_000;

  if (elapsed < 24) {
    return isUsefulDay(start, excludedDates) ? Math.max(0, elapsed - 18) : 0;
  }

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 12);
  let usefulHours = 0;
  const cursor = new Date(startDay);

  while (cursor < endDay) {
    if (isUsefulDay(cursor, excludedDates)) usefulHours += 6;
    cursor.setDate(cursor.getDate() + 1);
  }

  if (isUsefulDay(endDay, excludedDates)) {
    const endHour = end.getHours() + end.getMinutes() / 60 + end.getSeconds() / 3600;
    usefulHours += Math.min(6, Math.max(0, endHour));
  }

  return usefulHours;
}

export function daysUntil(value: string): number {
  const end = new Date(value);
  if (!value || Number.isNaN(end.getTime())) return Number.POSITIVE_INFINITY;
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

export function excelDateToIso(value: unknown): string {
  if (value instanceof Date) return toLocalInput(value);
  if (typeof value === "number") {
    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const fractionalDay = value - Math.floor(value);
    const totalSeconds = Math.round(86400 * fractionalDay);
    dateInfo.setUTCHours(Math.floor(totalSeconds / 3600), Math.floor((totalSeconds % 3600) / 60), totalSeconds % 60);
    return toLocalInput(new Date(dateInfo.getUTCFullYear(), dateInfo.getUTCMonth(), dateInfo.getUTCDate(), dateInfo.getUTCHours(), dateInfo.getUTCMinutes()));
  }
  if (typeof value === "string" && value.trim()) {
    const brazilian = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (brazilian) {
      const [, day, month, year, hour = "0", minute = "0", second = "0"] = brazilian;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
      if (!Number.isNaN(parsed.getTime())) return toLocalInput(parsed);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return toLocalInput(parsed);
  }
  return "";
}
