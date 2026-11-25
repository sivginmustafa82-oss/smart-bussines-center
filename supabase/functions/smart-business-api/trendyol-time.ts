/**
 * Pure Europe/Istanbul date helpers for the Trendyol API.
 * No Deno/Node APIs: the edge function imports this file and the app's Vitest suite tests it.
 *
 * Trendyol sends and expects Unix epoch milliseconds. A seller thinks in Istanbul calendar
 * days, so a selected range [from, to] becomes
 *   startDate = from 00:00:00.000 Istanbul time
 *   endDate   = to   23:59:59.999 Istanbul time
 * independent of the server's own time zone (edge functions run in UTC).
 */
export const TRENDYOL_TIME_ZONE = "Europe/Istanbul";
const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TRENDYOL_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface IstanbulParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export function istanbulParts(epochMs: number): IstanbulParts {
  if (!Number.isFinite(epochMs)) throw new Error("Geçersiz zaman damgası");
  const parts = partsFormatter.formatToParts(new Date(epochMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
    millisecond: ((epochMs % 1000) + 1000) % 1000,
  };
}

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/** Calendar day (YYYY-MM-DD) of an epoch-ms timestamp in Istanbul. */
export function istanbulDateFromEpoch(epochMs: number): string {
  const p = istanbulParts(epochMs);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "YYYY-MM-DD HH:mm:ss.SSS" in Istanbul — for notes and debugging. */
export function istanbulDateTimeFromEpoch(epochMs: number): string {
  const p = istanbulParts(epochMs);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.${pad(p.millisecond, 3)}`;
}

/** Formats an epoch-ms timestamp as an ISO 8601 string with Istanbul's actual offset (e.g. +03:00). */
export function istanbulIsoFromEpoch(epochMs: number): string {
  const p = istanbulParts(epochMs);
  const offMin = Math.round(offsetAt(epochMs) / 60_000);
  const sign = offMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offMin);
  const offH = pad(Math.floor(absMin / 60));
  const offM = pad(absMin % 60);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${offH}:${offM}`;
}

/** "HH:mm" or "HH:mm:ss" in Istanbul from an epoch-ms timestamp. */
export function istanbulTimeFromEpoch(epochMs: number, includeSeconds = false): string {
  const p = istanbulParts(epochMs);
  return includeSeconds ? `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` : `${pad(p.hour)}:${pad(p.minute)}`;
}

function parseDate(date: string): { y: number; m: number; d: number } {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error("Tarih YYYY-AA-GG biçiminde olmalı");
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error("Geçersiz tarih: " + date);
  }
  return { y, m, d };
}

export function isValidIsoDate(date: unknown): date is string {
  if (typeof date !== "string") return false;
  try {
    parseDate(date);
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of Istanbul local time from UTC at the given instant. */
function offsetAt(epochMs: number): number {
  const p = istanbulParts(epochMs);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, p.millisecond);
  return asUtc - epochMs;
}

/** Epoch ms of `date` 00:00:00.000 in Istanbul. Handles historic offset changes. */
export function istanbulDayStartEpoch(date: string): number {
  const { y, m, d } = parseDate(date);
  const wallAsUtc = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  let guess = wallAsUtc - offsetAt(wallAsUtc);
  // Re-check once in case the offset differs at the corrected instant (DST transitions).
  guess = wallAsUtc - offsetAt(guess);
  return guess;
}

/** Epoch ms of `date` 23:59:59.999 in Istanbul (one millisecond before the next local midnight). */
export function istanbulDayEndEpoch(date: string): number {
  return istanbulDayStartEpoch(addDays(date, 1)) - 1;
}

/** Epoch ms of the day AFTER `date` at 00:00:00.000 in Istanbul (half-open upper bound). */
export function istanbulNextDayStartEpoch(date: string): number {
  return istanbulDayStartEpoch(addDays(date, 1));
}

export interface IstanbulEpochRange {
  /** Inclusive lower bound (from 00:00:00.000 Europe/Istanbul), or null when unbounded. */
  startMs: number | null;
  /** Exclusive upper bound (nextDay(to) 00:00:00.000 Europe/Istanbul), or null when unbounded. */
  endExclusiveMs: number | null;
}

/** Half-open UTC epoch bounds [startMs, endExclusiveMs) for an inclusive Istanbul calendar-day range. */
export function istanbulRangeBounds(from: string | null, to: string | null): IstanbulEpochRange {
  return {
    startMs: from && isValidIsoDate(from) ? istanbulDayStartEpoch(from) : null,
    endExclusiveMs: to && isValidIsoDate(to) ? istanbulNextDayStartEpoch(to) : null,
  };
}

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface IstanbulMonthRange {
  period: string;
  from: string;
  to: string;
  startMs: number;
  endExclusiveMs: number;
}

/** Calendar bounds and half-open UTC epoch interval [monthStart, nextMonthStart) in Europe/Istanbul. */
export function istanbulMonthRange(period: string): IstanbulMonthRange {
  const match = PERIOD_RE.exec(period);
  if (!match) throw new Error("Dönem YYYY-AA biçiminde olmalı: " + period);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${match[1]}-${match[2]}-01`;
  const to = `${match[1]}-${match[2]}-${pad(lastDay)}`;
  return {
    period,
    from,
    to,
    startMs: istanbulDayStartEpoch(from),
    endExclusiveMs: istanbulNextDayStartEpoch(to),
  };
}

const TIMESTAMP_WITH_TZ_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parses a real timestamp (numeric epoch ms or ISO-8601 string with explicit time and timezone).
 * Never parses date-only strings (YYYY-MM-DD) so they are never fabricated as 00:00 or shifted.
 */
export function parseTimestampMs(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || isValidIsoDate(trimmed)) return null;
  if (/^\d{10,16}$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
  if (!TIMESTAMP_WITH_TZ_RE.test(trimmed)) return null;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converts either a date-only YYYY-MM-DD string (kept as-is without timezone shift)
 * or a real timestamp (epoch ms / ISO timestamp with timezone) to its Europe/Istanbul YYYY-MM-DD day.
 */
export function istanbulDateFromTimestamp(value: string | number | null | undefined): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isValidIsoDate(trimmed)) return trimmed;
  }
  const ms = parseTimestampMs(value);
  return ms == null ? null : istanbulDateFromEpoch(ms);
}

/** Checks whether a UTC epoch ms lies inside [from 00:00 TR, nextDay(to) 00:00 TR). */
export function isTimestampInIstanbulRange(
  epochMs: number,
  range: { from: string | null; to: string | null },
): boolean {
  const { startMs, endExclusiveMs } = istanbulRangeBounds(range.from, range.to);
  if (startMs != null && epochMs < startMs) return false;
  if (endExclusiveMs != null && epochMs >= endExclusiveMs) return false;
  return true;
}

/**
 * Checks whether a date-only YYYY-MM-DD string lies inside the half-open Istanbul calendar range
 * [from, nextDay(to)) without ever converting through the browser's local timezone.
 */
export function isDateOnlyInIstanbulRange(
  date: string,
  range: { from: string | null; to: string | null },
): boolean {
  if (!isValidIsoDate(date)) return false;
  if (range.from && isValidIsoDate(range.from) && date < range.from) return false;
  if (range.to && isValidIsoDate(range.to) && date >= addDays(range.to, 1)) return false;
  return true;
}

const ISTANBUL_WALL_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/** Converts an Istanbul wall-clock string ("YYYY-MM-DD HH:mm:ss[.SSS]") to UTC epoch ms. */
export function istanbulWallTimeToEpoch(wallTime: string): number | null {
  const match = ISTANBUL_WALL_RE.exec(wallTime.trim());
  if (!match) return null;
  const datePart = match[1];
  if (!datePart || !isValidIsoDate(datePart)) return null;
  const { y, m, d } = parseDate(datePart);
  const hh = Number(match[2]);
  const mm = Number(match[3]);
  const ss = Number(match[4] ?? "0");
  const ms = Number((match[5] ?? "0").padEnd(3, "0"));
  if (hh > 23 || mm > 59 || ss > 59 || ms > 999) return null;
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm, ss, ms);
  let guess = wallAsUtc - offsetAt(wallAsUtc);
  guess = wallAsUtc - offsetAt(guess);
  return guess;
}

const ORDER_TIME_ISO_NOTE_RE = /Sipariş:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))/;
const ORDER_TIME_WALL_NOTE_RE = /Sipariş zamanı:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s*Europe\/Istanbul/;
const RETURN_APPROVAL_NOTE_RE = /Son durum güncelleme:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s*Europe\/Istanbul/;

/**
 * Extracts real Trendyol timestamps preserved in a record note when the DB schema does not yet
 * carry dedicated timestamp columns. Returns undefined when no real time was recorded.
 */
export function extractTrendyolTimestampsFromNote(note: string | null | undefined): {
  orderedAt?: string;
  approvedAt?: string;
} {
  if (!note) return {};
  const out: { orderedAt?: string; approvedAt?: string } = {};
  const orderIsoMatch = ORDER_TIME_ISO_NOTE_RE.exec(note);
  if (orderIsoMatch?.[1]) {
    const ms = parseTimestampMs(orderIsoMatch[1]);
    if (ms != null) out.orderedAt = new Date(ms).toISOString();
  } else {
    const orderWallMatch = ORDER_TIME_WALL_NOTE_RE.exec(note);
    if (orderWallMatch?.[1]) {
      const ms = istanbulWallTimeToEpoch(orderWallMatch[1]);
      if (ms != null) out.orderedAt = new Date(ms).toISOString();
    }
  }
  const approvalMatch = RETURN_APPROVAL_NOTE_RE.exec(note);
  if (approvalMatch?.[1]) {
    const ms = istanbulWallTimeToEpoch(approvalMatch[1]);
    if (ms != null) out.approvedAt = new Date(ms).toISOString();
  }
  return out;
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function daysBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

/** Today's calendar day in Istanbul. */
export function istanbulToday(nowMs: number = Date.now()): string {
  return istanbulDateFromEpoch(nowMs);
}

export interface TrendyolQueryWindow {
  /** Istanbul calendar days covered by this request, inclusive. */
  from: string;
  to: string;
  /** Epoch ms sent to Trendyol. */
  startDate: number;
  endDate: number;
  /** Half-open exclusive upper bound (nextDay(to) 00:00:00.000 Europe/Istanbul). */
  endExclusiveDate: number;
}

/**
 * Splits an inclusive Istanbul day range into API windows aligned to local midnight.
 * Each window covers at most `maxDaysPerWindow` local days, keeping requests inside
 * Trendyol's two-week query limit. Windows are contiguous: next.startDate = prev.endDate + 1.
 */
export function trendyolQueryWindows(from: string, to: string, maxDaysPerWindow = 13): TrendyolQueryWindow[] {
  if (daysBetween(from, to) < 0) throw new Error("Başlangıç tarihi bitiş tarihinden sonra olamaz");
  if (maxDaysPerWindow < 1) throw new Error("Geçersiz pencere boyutu");
  const windows: TrendyolQueryWindow[] = [];
  let cursor = from;
  while (daysBetween(cursor, to) >= 0) {
    const remaining = daysBetween(cursor, to) + 1;
    const windowEnd = addDays(cursor, Math.min(maxDaysPerWindow, remaining) - 1);
    const endExclusiveDate = istanbulNextDayStartEpoch(windowEnd);
    windows.push({
      from: cursor,
      to: windowEnd,
      startDate: istanbulDayStartEpoch(cursor),
      endDate: endExclusiveDate - 1,
      endExclusiveDate,
    });
    cursor = addDays(windowEnd, 1);
  }
  return windows;
}

export const MAX_SYNC_RANGE_DAYS = 31;

/**
 * Resolves the requested order-sync range.
 * Explicit start_date/end_date (Istanbul days) win; otherwise the last `days` Istanbul days
 * ending today are used (legacy clients send only `days`).
 */
export function resolveSyncRange(
  input: { start_date?: unknown; end_date?: unknown; days?: unknown },
  nowMs: number = Date.now(),
): { from: string; to: string } {
  const today = istanbulToday(nowMs);
  if (input.start_date != null || input.end_date != null) {
    if (!isValidIsoDate(input.start_date) || !isValidIsoDate(input.end_date)) {
      throw new Error("Başlangıç ve bitiş tarihi YYYY-AA-GG biçiminde olmalı.");
    }
    const from = input.start_date;
    const to = input.end_date;
    if (daysBetween(from, to) < 0) throw new Error("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
    if (daysBetween(from, to) + 1 > MAX_SYNC_RANGE_DAYS) {
      throw new Error(`Tek seferde en fazla ${MAX_SYNC_RANGE_DAYS} gün aktarılabilir.`);
    }
    if (daysBetween(today, from) > 0) throw new Error("Başlangıç tarihi bugünden sonra olamaz.");
    return { from, to };
  }
  const days = Math.min(30, Math.max(1, Math.floor(Number(input.days) || 30)));
  return { from: addDays(today, -(days - 1)), to: today };
}
