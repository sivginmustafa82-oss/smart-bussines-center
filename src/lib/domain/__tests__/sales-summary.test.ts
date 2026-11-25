import { describe, expect, it } from "vitest";
import { calculateSalesSummary } from "../sales-summary";
import type { OrderRecord } from "../types";

const record = (p: Partial<OrderRecord>): OrderRecord => ({
  id: "r", tenantId: "t", storeId: "s", type: "sale", orderNumber: "order-1",
  date: "2026-09-10", productId: null, quantity: 1, grossAmount: 1000,
  discountAmount: 100, couponAmount: 0, commissionAmount: 0, shippingAmount: 0,
  withholdingAmount: 0, note: "", source: "imported", verified: true, createdAt: "",
  ...p,
});

describe("calculateSalesSummary — Claude-compatible matching", () => {
  it("matches accepted return records by order number and barcode", () => {
    const summary = calculateSalesSummary([
      record({ id: "sale-a", note: "Paket:1 | Barkod:ABC" }),
      record({ id: "sale-b", note: "Paket:2 | Barkod:XYZ", grossAmount: 500 }),
      record({ id: "return-a", type: "return", note: "Paket:1 | Barkod:ABC", grossAmount: 1000, discountAmount: 100 }),
      record({ id: "return-wrong-barcode", type: "return", note: "Paket:1 | Barkod:OTHER", grossAmount: 500 }),
      record({ id: "return-wrong-order", type: "return", orderNumber: "other", note: "Barkod:ABC", grossAmount: 500 }),
      record({ id: "cancel", type: "cancellation", note: "Paket:3 | Barkod:DEF", grossAmount: 200, discountAmount: 50 }),
    ]);

    expect(summary.gross.units).toBe(3);
    expect(summary.gross.amount).toBe(1700);
    expect(summary.cancellations.units).toBe(1);
    expect(summary.returns.units).toBe(1);
    expect(summary.returns.amount).toBe(1000);
    expect(summary.discounts.amount).toBe(100);
    expect(summary.net.units).toBe(1);
    expect(summary.net.amount).toBe(500);
  });

  it("does not count returns from outside the selected period or unmatched barcodes", () => {
    const summary = calculateSalesSummary([
      record({ note: "Barkod:AAA" }),
      record({ type: "return", note: "Barkod:BBB", grossAmount: 200 }),
    ]);
    expect(summary.returns.units).toBe(0);
    expect(summary.net.amount).toBe(900);
  });
});
