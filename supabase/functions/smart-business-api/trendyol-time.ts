/**
 * Pure Europe/Istanbul date helpers for the Trendyol API.
 * No Deno/Node APIs: the edge function imports this file and the app's Vitest suite tests it.
 *
 * Trendyol's reporting convention used by the seller applies a mandatory +3 hour
 * boundary shift. For a selected calendar range [from, to], query boundaries are
 * Istanbul midnight/end-of-day shifted forward by 3 hours. This intentionally makes
 * the API window equivalent to UTC date boundaries and includes early-hours records
 * (up to 02:59:59 Istanbul wall-clock on the following date) in the preceding report day.
 * The same offset is removed when assigning an API timestamp to a report date.
 * Never add another +3 in the browser: order_records.date is already normalized.
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

/** Calendar date used by Trendyol reports: remove the mandatory +3-hour boundary offset once. */
export function trendyolReportDateFromEpoch(epochMs: number): string {
  if (!Number.isFinite(epochMs)) throw new Error("Geçersiz zaman damgası");
  const shifted = new Date(epochMs - 3 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** "YYYY-MM-DD HH:mm:ss.SSS" in Istanbul — for notes and debugging. */
export function istanbulDateTimeFromEpoch(epochMs: number): string {
  const p = istanbulParts(epochMs);
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.${pad(p.millisecond, 3)}`;
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
    windows.push({
      from: cursor,
      to: windowEnd,
      startDate: istanbulDayStartEpoch(cursor) + 3 * 60 * 60 * 1000,
      endDate: istanbulDayEndEpoch(windowEnd) + 3 * 60 * 60 * 1000,
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
