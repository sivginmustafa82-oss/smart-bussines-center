import {
  TRENDYOL_TIME_ZONE,
  istanbulDateFromTimestamp,
  istanbulToday,
  parseTimestampMs,
} from "../../supabase/functions/smart-business-api/trendyol-time";

const tryFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat("tr-TR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatTRY(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  // Avoid "-0,00 ₺"
  const v = Math.abs(value) < 0.005 ? 0 : value;
  return tryFormatter.format(v);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return numberFormatter.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return percentFormatter.format(value);
}

/**
 * Formats either a date-only YYYY-MM-DD string (without browser-timezone drift)
 * or a full ISO timestamp converted to Europe/Istanbul calendar date.
 */
export function formatDate(iso: string): string {
  const istanbulDate = istanbulDateFromTimestamp(iso) ?? iso.slice(0, 10);
  const [y, m, d] = istanbulDate.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Formats a real timestamp in Europe/Istanbul (e.g. "01 Eki 2026 02:23").
 * Returns null when the input is date-only or invalid, so no fake "00:00" is ever shown.
 */
export function formatIstanbulDateTime(
  iso: string | number | null | undefined,
  includeSeconds = false,
): string | null {
  const ms = parseTimestampMs(iso);
  if (ms == null) return null;
  return new Date(ms).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
    hourCycle: "h23",
    timeZone: TRENDYOL_TIME_ZONE,
  });
}

/**
 * Formats only the clock time of a real timestamp in Europe/Istanbul (e.g. "02:23").
 * Returns null when the input is date-only or invalid.
 */
export function formatIstanbulTime(
  iso: string | number | null | undefined,
  includeSeconds = false,
): string | null {
  const ms = parseTimestampMs(iso);
  if (ms == null) return null;
  return new Date(ms).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
    hourCycle: "h23",
    timeZone: TRENDYOL_TIME_ZONE,
  });
}

const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function formatPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return `${MONTHS[m - 1]} ${y}`;
}

export function todayISO(): string {
  // All business-day boundaries follow the store's local timezone, not the device timezone.
  return istanbulToday();
}

export function currentPeriod(): string {
  return todayISO().slice(0, 7);
}

/** Parses Turkish ("1.234,56") or plain ("1234.56") number text. Returns NaN when invalid. */
export function parseAmount(text: string): number {
  const t = text.trim().replace(/\s|₺/g, "");
  if (t === "") return NaN;
  let normalized = t;
  if (t.includes(",")) normalized = t.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return NaN;
  return Number(normalized);
}
