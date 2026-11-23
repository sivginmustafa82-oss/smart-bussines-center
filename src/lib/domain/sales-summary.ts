import type { OrderRecord } from "./types";

export interface QtyAmount {
  units: number;
  amount: number;
}

export interface SalesSummary {
  gross: QtyAmount;
  returns: QtyAmount;
  cancellations: QtyAmount;
  /** net = gross − returns − cancellations, for units and amounts alike. */
  net: QtyAmount;
  lines: { sales: number; returns: number; cancellations: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Store sales summary. Amounts are gross (KDV dahil müşteri fiyatı × adet) line amounts;
 * discounts, commission and other costs are intentionally not deducted here
 * — those belong to the profitability statement.
 */
export function calculateSalesSummary(records: OrderRecord[]): SalesSummary {
  const gross = { units: 0, amount: 0 };
  const returns = { units: 0, amount: 0 };
  const cancellations = { units: 0, amount: 0 };
  const lines = { sales: 0, returns: 0, cancellations: 0 };
  for (const r of records) {
    const bucket = r.type === "sale" ? gross : r.type === "return" ? returns : cancellations;
    bucket.units += r.quantity;
    bucket.amount += r.grossAmount;
    if (r.type === "sale") lines.sales += 1;
    else if (r.type === "return") lines.returns += 1;
    else lines.cancellations += 1;
  }
  const fix = (x: QtyAmount): QtyAmount => ({ units: x.units, amount: round2(x.amount) });
  return {
    gross: fix(gross),
    returns: fix(returns),
    cancellations: fix(cancellations),
    net: {
      units: gross.units - returns.units - cancellations.units,
      amount: round2(gross.amount - returns.amount - cancellations.amount),
    },
    lines,
  };
}
