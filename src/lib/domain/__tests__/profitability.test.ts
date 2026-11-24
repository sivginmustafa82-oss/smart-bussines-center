import { describe, expect, it } from "vitest";
import { calculateProfit, filterExpenses, filterRecords } from "../profitability";
import type { Expense, OrderRecord, Product } from "../types";

const product = (id: string, unitCost: number | null): Product => ({
  id, tenantId: "t1", storeId: "s1", name: id, sku: id, barcode: "", unitCost, vatRate: 20,
  source: "manual", verified: false, createdAt: "", updatedAt: "",
});

const rec = (p: Partial<OrderRecord>): OrderRecord => ({
  id: Math.random().toString(), tenantId: "t1", storeId: "s1", type: "sale", orderNumber: "1",
  date: "2026-10-10", productId: "p1", quantity: 1, grossAmount: 0, discountAmount: 0, couponAmount: 0,
  commissionAmount: 0, shippingAmount: 0, withholdingAmount: 0, note: "", source: "manual",
  verified: false, createdAt: "", ...p,
});

const exp = (p: Partial<Expense>): Expense => ({
  id: Math.random().toString(), tenantId: "t1", storeId: null, date: "2026-10-15", category: "diger",
  amount: 0, description: "x", source: "manual", createdAt: "", ...p,
});

describe("calculateProfit", () => {
  const products = [product("p1", 100), product("p2", null)];

  it("separates every line and computes net profit", () => {
    const records = [
      rec({ quantity: 2, grossAmount: 1000, discountAmount: 50, couponAmount: 30, commissionAmount: 150, shippingAmount: 40, withholdingAmount: 10 }),
      rec({ type: "return", quantity: 1, grossAmount: 500, discountAmount: 25, couponAmount: 15, commissionAmount: 75, shippingAmount: 20, withholdingAmount: 5 }),
      rec({ type: "cancellation", productId: "p1", quantity: 1, grossAmount: 200, discountAmount: 20, couponAmount: 10 }),
    ];
    const expenses = [
      exp({ category: "reklam", amount: 60 }),
      exp({ category: "kargo", amount: 5 }),
      exp({ category: "vergi", amount: 7 }),
      exp({ category: "personel", amount: 100 }),
    ];
    const b = calculateProfit(records, expenses, products);
    expect(b.grossSales).toBe(1200); // cancelled order lines are included in gross
    expect(b.returns).toBe(500);
    expect(b.cancellations).toBe(200);
    expect(b.discounts).toBe(40); // 80 − 40 reversed
    expect(b.netSales).toBe(460); // 1200 − 200 − 500 − 40
    expect(b.commission).toBe(75); // 150 − 75 refunded
    expect(b.shipping).toBe(65); // 40 + 20 return shipping + 5 expense
    expect(b.advertising).toBe(60);
    expect(b.taxes).toBe(12); // 10 − 5 + 7
    expect(b.productCost).toBe(0); // 2×100 − 1×100 − 1×100
    expect(b.otherExpenses).toBe(100);
    expect(b.netProfit).toBe(148); // 460 − 75 − 65 − 60 − 12 − 0 − 100
  });

  it("ignores returns when the original sale is outside the selected period", () => {
    const b = calculateProfit([
      rec({ orderNumber: "in-period", grossAmount: 100 }),
      rec({ type: "return", orderNumber: "outside-period", grossAmount: 50 }),
      rec({ type: "cancellation", orderNumber: "in-period", grossAmount: 20 }),
    ], [], products);
    expect(b.grossSales).toBe(120);
    expect(b.cancellations).toBe(20);
    expect(b.returns).toBe(0);
    expect(b.netSales).toBe(100);
  });

  it("counts sale lines with missing unit cost", () => {
    const b = calculateProfit([rec({ productId: "p2", grossAmount: 100 }), rec({ productId: null, grossAmount: 100 })], [], products);
    expect(b.missingCostRecords).toBe(2);
    expect(b.productCost).toBe(0);
  });

  it("returns null margin when there are no net sales", () => {
    expect(calculateProfit([], [], products).margin).toBeNull();
  });

  it("margin is net profit divided by net sales", () => {
    const b = calculateProfit([rec({ grossAmount: 1000, quantity: 1 })], [], products);
    expect(b.netProfit).toBe(900);
    expect(b.margin).toBeCloseTo(0.9);
  });
});

describe("filters", () => {
  it("general expenses only count when all stores are selected", () => {
    const e = [exp({ storeId: null, amount: 10 }), exp({ storeId: "s1", amount: 5 })];
    expect(filterExpenses(e, { storeId: "all", from: null, to: null })).toHaveLength(2);
    expect(filterExpenses(e, { storeId: "s1", from: null, to: null })).toHaveLength(1);
  });

  it("date range is inclusive", () => {
    const r = [rec({ date: "2026-10-01" }), rec({ date: "2026-10-31" }), rec({ date: "2026-11-01" })];
    expect(filterRecords(r, { storeId: "all", from: "2026-10-01", to: "2026-10-31" })).toHaveLength(2);
  });
});
