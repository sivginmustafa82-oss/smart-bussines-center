import { describe, expect, it } from "vitest";
import { compareTotals } from "../reconciliation";

const app = { grossSales: 1000, cancellations: 0, returns: 100, discounts: 0, commission: 150, shipping: 40, withholding: 10, netPayout: 700 };

describe("compareTotals", () => {
  it("differences up to 1 TRY match, larger ones are mismatches, empty fields are missing", () => {
    const rows = compareTotals(app, {
      grossSales: 1000.9, cancellations: 0, returns: 120, discounts: null,
      commission: 150, shipping: 40, withholding: 10, netPayout: 650,
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.grossSales.status).toBe("match");
    expect(by.returns.status).toBe("mismatch");
    expect(by.returns.diff).toBe(-20);
    expect(by.discounts.status).toBe("missing");
    expect(by.netPayout.diff).toBe(50);
  });
});
