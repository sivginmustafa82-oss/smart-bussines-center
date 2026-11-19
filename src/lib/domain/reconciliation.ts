import type { MarketplaceTotals } from "./types";
import type { ProfitBreakdown } from "./profitability";

export type ReconStatus = "match" | "mismatch" | "missing";

export interface ReconRow {
  key: keyof MarketplaceTotals;
  label: string;
  app: number;
  marketplace: number | null;
  diff: number | null; // app − marketplace
  status: ReconStatus;
}

/** Default tolerance: differences up to 1,00 ₺ count as rounding. */
export const DEFAULT_TOLERANCE = 1;

/**
 * App-side figures comparable to a marketplace settlement report.
 * Only marketplace-level deductions belong in net payout: commission, order shipping
 * and withholding. Separately entered expenses (ads, rent…) are not part of it.
 */
export function appTotalsForReconciliation(
  b: ProfitBreakdown,
  orderOnly: { shipping: number; withholding: number },
): Record<keyof MarketplaceTotals, number> {
  return {
    grossSales: b.grossSales,
    cancellations: b.cancellations,
    returns: b.returns,
    discounts: b.discounts,
    commission: b.commission,
    shipping: orderOnly.shipping,
    withholding: orderOnly.withholding,
    netPayout:
      Math.round((b.netSales - b.commission - orderOnly.shipping - orderOnly.withholding) * 100) /
      100,
  };
}

export const RECON_LABELS: Record<keyof MarketplaceTotals, string> = {
  grossSales: "Brüt satış",
  cancellations: "İptaller",
  returns: "İadeler",
  discounts: "İndirim ve kuponlar",
  commission: "Komisyon",
  shipping: "Kargo kesintisi",
  withholding: "Stopaj",
  netPayout: "Net hakediş",
};

export function compareTotals(
  app: Record<keyof MarketplaceTotals, number>,
  marketplace: MarketplaceTotals,
  tolerance = DEFAULT_TOLERANCE,
): ReconRow[] {
  return (Object.keys(RECON_LABELS) as (keyof MarketplaceTotals)[]).map((key) => {
    const mp = marketplace[key];
    if (mp == null) {
      return { key, label: RECON_LABELS[key], app: app[key], marketplace: null, diff: null, status: "missing" };
    }
    const diff = Math.round((app[key] - mp) * 100) / 100;
    return {
      key,
      label: RECON_LABELS[key],
      app: app[key],
      marketplace: mp,
      diff,
      status: Math.abs(diff) <= tolerance ? "match" : "mismatch",
    };
  });
}
