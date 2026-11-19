import { describe, expect, it } from "vitest";
import { moneyField, orderRecordSchema, productSchema, signUpSchema, storeSchema } from "../schemas";

describe("money input", () => {
  it("accepts Turkish formatted amounts", () => {
    expect(moneyField("Tutar").parse("1.234,56")).toBe(1234.56);
    expect(moneyField("Tutar").parse("99.5")).toBe(99.5);
  });
  it("rejects negatives and more than 2 decimals", () => {
    expect(moneyField("Tutar").safeParse("-5").success).toBe(false);
    expect(moneyField("Tutar").safeParse("1,234").success).toBe(false);
  });
});

describe("product", () => {
  it("empty unit cost is stored as unknown (null), not zero", () => {
    const r = productSchema.parse({ storeId: "s", name: "Ürün", sku: "A-1", barcode: "", unitCost: "", vatRate: "20" });
    expect(r.unitCost).toBeNull();
  });
});

describe("order record", () => {
  const base = { storeId: "s", type: "sale", orderNumber: "123", date: "2026-11-01", productId: null, quantity: "1",
    grossAmount: "100", discountAmount: "", couponAmount: "", commissionAmount: "", shippingAmount: "", withholdingAmount: "", note: "" };
  it("discount + coupon cannot exceed gross", () => {
    expect(orderRecordSchema.safeParse({ ...base, discountAmount: "60", couponAmount: "50" }).success).toBe(false);
  });
  it("quantity must be a positive integer", () => {
    expect(orderRecordSchema.safeParse({ ...base, quantity: "0" }).success).toBe(false);
    expect(orderRecordSchema.safeParse({ ...base, quantity: "1.5" }).success).toBe(false);
  });
});

describe("store & signup", () => {
  it("only Trendyol stores can be added for now", () => {
    expect(storeSchema.safeParse({ name: "Mağazam", marketplace: "hepsiburada" }).success).toBe(false);
    expect(storeSchema.safeParse({ name: "Mağazam", marketplace: "trendyol" }).success).toBe(true);
  });
  it("password needs 8+ chars with a letter and a digit", () => {
    const b = { name: "Ayşe", companyName: "ABC", email: "a@b.co" };
    expect(signUpSchema.safeParse({ ...b, password: "abcdefgh" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...b, password: "abcdefg1" }).success).toBe(true);
  });
});
