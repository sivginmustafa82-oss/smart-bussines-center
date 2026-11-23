import type { OrderRecord } from "./types";

export interface QtyAmount {
  units: number;
  amount: number;
}

export interface SalesSummary {
  gross: QtyAmount;
  returns: QtyAmount;
  cancellations: QtyAmount;
  discounts: { amount: number };
  /** Trendyol-style net = gross − cancellations − returns − net discounts. */
  net: QtyAmount;
  lines: { sales: number; returns: number; cancellations: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Uses the same order-line ledger and deduction order as the profitability
 * calculation: sale discounts/coupons increase deductions; reversed discounts
 * on returns/cancellations reduce them.
 */
export function calculateSalesSummary(records: OrderRecord[]): SalesSummary {
  const gross = { units: 0, amount: 0 };
  const returns = { units: 0, amount: 0 };
  const cancellations = { units: 0, amount: 0 };
  let discounts = 0;
  const lines = { sales: 0, returns: 0, cancellations: 0 };

  for (const r of records) {
    const disc = r.discountAmount + r.couponAmount;
    if (r.type === "sale") {
      gross.units += r.quantity;
      gross.amount += r.grossAmount;
      discounts += disc;
      lines.sales += 1;
    } else if (r.type === "return") {
      returns.units += r.quantity;
      returns.amount += r.grossAmount;
      discounts -= disc;
      lines.returns += 1;
    } else {
      cancellations.units += r.quantity;
      cancellations.amount += r.grossAmount;
      discounts -= disc;
      lines.cancellations += 1;
    }
  }

  return {
    gross: { units: gross.units, amount: round2(gross.amount) },
    returns: { units: returns.units, amount: round2(returns.amount) },
    cancellations: { units: cancellations.units, amount: round2(cancellations.amount) },
    discounts: { amount: round2(discounts) },
    net: {
      units: gross.units - returns.units - cancellations.units,
      amount: round2(gross.amount - returns.amount - cancellations.amount - discounts),
    },
    lines,
  };
}
