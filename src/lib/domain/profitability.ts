import type { Expense, ExpenseCategory, OrderRecord, Product } from "./types";
import {
  extractTrendyolTimestampsFromNote,
  isDateOnlyInIstanbulRange,
  isTimestampInIstanbulRange,
  istanbulDateFromEpoch,
  istanbulMonthRange,
  parseTimestampMs,
} from "../../../supabase/functions/smart-business-api/trendyol-time";

export interface Filters {
  storeId: string | "all";
  from: string | null; // YYYY-MM-DD inclusive (Europe/Istanbul 00:00:00)
  to: string | null; // YYYY-MM-DD inclusive (half-open upper bound: next day 00:00:00 Europe/Istanbul)
}

export interface ProfitBreakdown {
  grossSales: number;
  cancellations: number;
  returns: number;
  discounts: number; // discounts + coupons, net of reversals
  netSales: number;
  commission: number;
  shipping: number;
  advertising: number;
  taxes: number;
  productCost: number;
  otherExpenses: number;
  netProfit: number;
  /** netProfit / netSales, null when net sales is not positive. */
  margin: number | null;
  counts: {
    sales: number;
    returns: number;
    cancellations: number;
    expenses: number;
    soldUnits: number;
    returnedUnits: number;
    cancelledUnits: number;
  };
  /** Sale lines whose product is unknown or has no unit cost — product cost is understated. */
  missingCostRecords: number;
  sources: { manual: number; imported: number };
}

const OTHER_CATEGORIES: ExpenseCategory[] = ["paketleme", "personel", "yazilim", "kira", "diger"];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Returns the exact ISO-8601 order timestamp if known from the record (or its Trendyol note).
 * Never invents a timestamp for date-only/manual records.
 */
export function recordOrderedAt(r: Pick<OrderRecord, "orderedAt" | "note">): string | undefined {
  const direct = parseTimestampMs(r.orderedAt);
  if (direct != null) return new Date(direct).toISOString();
  return extractTrendyolTimestampsFromNote(r.note).orderedAt;
}

/**
 * Returns the return approval/update ISO-8601 timestamp if known from the record (or its Trendyol note).
 * Always kept separate from the original order date/time.
 */
export function recordApprovedAt(r: Pick<OrderRecord, "approvedAt" | "note">): string | undefined {
  const direct = parseTimestampMs(r.approvedAt);
  if (direct != null) return new Date(direct).toISOString();
  return extractTrendyolTimestampsFromNote(r.note).approvedAt;
}

/**
 * Effective reporting calendar day (YYYY-MM-DD in Europe/Istanbul) for a sale, cancellation, or return.
 * Follows Trendyol store-summary semantics: all three use the original order date/time, never
 * the return approval timestamp. When a real `orderedAt` timestamp exists, it takes precedence over
 * a potentially UTC-shifted date string. Date-only records are returned as-is without browser-TZ drift.
 */
export function recordIstanbulDate(r: Pick<OrderRecord, "date" | "orderedAt" | "note">): string {
  const orderedMs = parseTimestampMs(recordOrderedAt(r));
  if (orderedMs != null) return istanbulDateFromEpoch(orderedMs);
  return r.date;
}

/**
 * Checks whether a YYYY-MM-DD date or real ISO timestamp falls in the half-open Europe/Istanbul
 * range [from 00:00:00 TR, nextDay(to) 00:00:00 TR).
 */
export function inRange(date: string, f: Pick<Filters, "from" | "to">): boolean {
  const tsMs = parseTimestampMs(date);
  if (tsMs != null) return isTimestampInIstanbulRange(tsMs, f);
  return isDateOnlyInIstanbulRange(date, f);
}

/**
 * Checks whether an OrderRecord falls inside [from 00:00:00 TR, nextDay(to) 00:00:00 TR).
 * Uses the exact `orderedAt` UTC epoch when available, and pure calendar-day comparison
 * (never browser local time) for date-only records.
 */
export function isOrderInRange(
  r: Pick<OrderRecord, "date" | "orderedAt" | "note">,
  f: Pick<Filters, "from" | "to">,
): boolean {
  const orderedMs = parseTimestampMs(recordOrderedAt(r));
  if (orderedMs != null) return isTimestampInIstanbulRange(orderedMs, f);
  return isDateOnlyInIstanbulRange(r.date, f);
}

export function filterRecords(records: OrderRecord[], f: Filters): OrderRecord[] {
  return records.filter((r) => (f.storeId === "all" || r.storeId === f.storeId) && isOrderInRange(r, f));
}

/** Store filter: general expenses (storeId null) only count when looking at all stores. */
export function filterExpenses(expenses: Expense[], f: Filters): Expense[] {
  return expenses.filter(
    (e) => (f.storeId === "all" || e.storeId === f.storeId) && isDateOnlyInIstanbulRange(e.date, f),
  );
}

/**
 * Transparent profitability calculation.
 *   netSales   = grossSales − cancellations − returns − discounts
 *   netProfit  = netSales − commission − shipping − advertising − taxes − productCost − otherExpenses
 * Gross sales includes cancelled order lines; cancellations are then deducted separately.
 * Approved returns reverse the related seller discount, commission and withholding.
 * Cancellation discounts are excluded from the seller-discount headline. Return/cancellation
 * shipping is an extra cost, and returned/cancelled units are assumed back in stock.
 */
export function calculateProfit(
  records: OrderRecord[],
  expenses: Expense[],
  products: Product[],
): ProfitBreakdown {
  const productMap = new Map(products.map((p) => [p.id, p]));
  let grossSales = 0;
  let cancellations = 0;
  let returns = 0;
  let discounts = 0;
  let commission = 0;
  let shipping = 0;
  let taxes = 0;
  let productCost = 0;
  let missingCostRecords = 0;
  const counts = {
    sales: 0,
    returns: 0,
    cancellations: 0,
    expenses: expenses.length,
    soldUnits: 0,
    returnedUnits: 0,
    cancelledUnits: 0,
  };
  const sources = { manual: 0, imported: 0 };
  const periodSaleOrders = new Set(records.filter((r) => r.type === "sale").map((r) => r.orderNumber));

  for (const r of records) {
    // A return belongs to the original sale period, not the later approval date.
    // Ignore claims whose original sale is not present in the selected period.
    if (r.type === "return" && !periodSaleOrders.has(r.orderNumber)) continue;
    sources[r.source] += 1;
    const unitCost = r.productId ? (productMap.get(r.productId)?.unitCost ?? null) : null;
    const lineCost = unitCost == null ? 0 : unitCost * r.quantity;
    const disc = r.discountAmount + r.couponAmount;
    shipping += r.shippingAmount;

    if (r.type === "sale") {
      counts.sales += 1;
      counts.soldUnits += r.quantity;
      grossSales += r.grossAmount;
      discounts += disc;
      commission += r.commissionAmount;
      taxes += r.withholdingAmount;
      productCost += lineCost;
      if (unitCost == null) missingCostRecords += 1;
    } else {
      if (r.type === "return") {
        counts.returns += 1;
        counts.returnedUnits += r.quantity;
        returns += r.grossAmount;
      } else {
        counts.cancellations += 1;
        counts.cancelledUnits += r.quantity;
        grossSales += r.grossAmount;
        cancellations += r.grossAmount;
      }
      // Only approved returns reverse seller discounts. Cancellation discounts
      // are not included in Trendyol's seller-discount headline.
      if (r.type === "return") discounts -= disc;
      commission -= r.commissionAmount;
      taxes -= r.withholdingAmount;
      productCost -= lineCost;
    }
  }

  let advertising = 0;
  let otherExpenses = 0;
  for (const e of expenses) {
    sources[e.source] += 1;
    if (e.category === "reklam") advertising += e.amount;
    else if (e.category === "kargo") shipping += e.amount;
    else if (e.category === "vergi") taxes += e.amount;
    else if (OTHER_CATEGORIES.includes(e.category)) otherExpenses += e.amount;
  }

  const netSales = grossSales - cancellations - returns - discounts;
  const netProfit =
    netSales - commission - shipping - advertising - taxes - productCost - otherExpenses;

  return {
    grossSales: round2(grossSales),
    cancellations: round2(cancellations),
    returns: round2(returns),
    discounts: round2(discounts),
    netSales: round2(netSales),
    commission: round2(commission),
    shipping: round2(shipping),
    advertising: round2(advertising),
    taxes: round2(taxes),
    productCost: round2(productCost),
    otherExpenses: round2(otherExpenses),
    netProfit: round2(netProfit),
    margin: netSales > 0 ? netProfit / netSales : null,
    counts,
    missingCostRecords,
    sources,
  };
}

/** Months (YYYY-MM in Europe/Istanbul) that have any record or expense, newest first. */
export function activePeriods(records: OrderRecord[], expenses: Expense[]): string[] {
  const set = new Set<string>();
  for (const r of records) set.add(recordIstanbulDate(r).slice(0, 7));
  for (const e of expenses) set.add(e.date.slice(0, 7));
  return [...set].sort().reverse();
}

export function periodRange(period: string): { from: string; to: string } {
  const { from, to } = istanbulMonthRange(period);
  return { from, to };
}
