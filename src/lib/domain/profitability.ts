import type { Expense, ExpenseCategory, OrderRecord, Product } from "./types";

export interface Filters {
  storeId: string | "all";
  from: string | null; // YYYY-MM-DD inclusive
  to: string | null; // YYYY-MM-DD inclusive
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

export function inRange(date: string, f: Pick<Filters, "from" | "to">): boolean {
  if (f.from && date < f.from) return false;
  if (f.to && date > f.to) return false;
  return true;
}

export function filterRecords(records: OrderRecord[], f: Filters): OrderRecord[] {
  return records.filter((r) => (f.storeId === "all" || r.storeId === f.storeId) && inRange(r.date, f));
}

/** Store filter: general expenses (storeId null) only count when looking at all stores. */
export function filterExpenses(expenses: Expense[], f: Filters): Expense[] {
  return expenses.filter(
    (e) => (f.storeId === "all" || e.storeId === f.storeId) && inRange(e.date, f),
  );
}

/**
 * Transparent profitability calculation.
 *   netSales   = grossSales − cancellations − returns − discounts
 *   netProfit  = netSales − commission − shipping − advertising − taxes − productCost − otherExpenses
 * Return/cancellation lines reverse discount, coupon, commission and withholding;
 * their shipping is an extra cost. Returned/cancelled units are assumed back in stock,
 * so their product cost is reversed.
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

  for (const r of records) {
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
        cancellations += r.grossAmount;
      }
      discounts -= disc;
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

/** Months (YYYY-MM) that have any record or expense, newest first. */
export function activePeriods(records: OrderRecord[], expenses: Expense[]): string[] {
  const set = new Set<string>();
  for (const r of records) set.add(r.date.slice(0, 7));
  for (const e of expenses) set.add(e.date.slice(0, 7));
  return [...set].sort().reverse();
}

export function periodRange(period: string): { from: string; to: string } {
  const [y = 1970, m = 1] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}
