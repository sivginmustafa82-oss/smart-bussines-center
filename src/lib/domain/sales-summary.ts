import type { OrderRecord } from "./types";

export interface QtyAmount {
  units: number;
  amount: number;
}

export interface SalesSummary {
  gross: QtyAmount;
  returns: QtyAmount;
  cancellations: QtyAmount;
  discounts: { amount: number; sales: number; returned: number };
  /** Trendyol-style net = gross − cancellations − returns − net discounts. */
  net: QtyAmount;
  lines: { sales: number; returns: number; cancellations: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Trendyol store summary: sale seller-discounts are reduced only by the
 * discount share attached to approved returns. Cancelled package discounts
 * are excluded from the seller-discount headline.
 */
export function calculateSalesSummary(records: OrderRecord[]): SalesSummary {
  const gross = { units: 0, amount: 0 };
  const returns = { units: 0, amount: 0 };
  const cancellations = { units: 0, amount: 0 };
  let salesDiscounts = 0;
  let returnedDiscounts = 0;
  const lines = { sales: 0, returns: 0, cancellations: 0 };

  for (const r of records) {
    const disc = r.discountAmount + r.couponAmount;
    if (r.type === "sale") {
      gross.units += r.quantity;
      gross.amount += r.grossAmount;
      salesDiscounts += disc;
      lines.sales += 1;
    } else if (r.type === "return") {
      returns.units += r.quantity;
      returns.amount += r.grossAmount;
      returnedDiscounts += disc;
      lines.returns += 1;
    } else {
      // Trendyol's gross sales includes cancelled order lines; cancellations are
      // shown separately and deducted only when calculating net sales.
      gross.units += r.quantity;
      gross.amount += r.grossAmount;
      cancellations.units += r.quantity;
      cancellations.amount += r.grossAmount;
      // Cancelled package discounts are not part of Trendyol's seller-discount headline.
      lines.cancellations += 1;
    }
  }

  return {
    gross: { units: gross.units, amount: round2(gross.amount) },
    returns: { units: returns.units, amount: round2(returns.amount) },
    cancellations: { units: cancellations.units, amount: round2(cancellations.amount) },
    discounts: {
      amount: round2(salesDiscounts - returnedDiscounts),
      sales: round2(salesDiscounts),
      returned: round2(returnedDiscounts),
    },
    net: {
      units: gross.units - returns.units - cancellations.units,
      amount: round2(gross.amount - returns.amount - cancellations.amount - discounts),
    },
    lines,
  };
}
