import { beforeEach, describe, expect, it } from "vitest";
import { __resetForTests, readDB } from "./local-db";
import { createStore, deleteStore, OwnershipError, scoped, upsertOrder, upsertProduct } from "./repo";

const order = (storeId: string, productId: string | null = null) => ({
  storeId, type: "sale" as const, orderNumber: "1", date: "2026-11-01", productId, quantity: 1,
  grossAmount: 100, discountAmount: 0, couponAmount: 0, commissionAmount: 0, shippingAmount: 0,
  withholdingAmount: 0, note: "",
});

describe("tenant ownership", () => {
  beforeEach(() => __resetForTests());

  it("a tenant cannot write into another tenant's store", () => {
    const s = createStore("tenantA", { name: "A", marketplace: "trendyol" });
    expect(() => upsertOrder("tenantB", order(s.id))).toThrow(OwnershipError);
    expect(() => upsertProduct("tenantB", { storeId: s.id, name: "x", sku: "x", barcode: "", unitCost: 1, vatRate: 20 })).toThrow(OwnershipError);
  });

  it("an order cannot reference a product from a different store", () => {
    const s1 = createStore("t", { name: "1", marketplace: "trendyol" });
    const s2 = createStore("t", { name: "2", marketplace: "trendyol" });
    const p = upsertProduct("t", { storeId: s1.id, name: "x", sku: "x", barcode: "", unitCost: 1, vatRate: 20 });
    expect(() => upsertOrder("t", order(s2.id, p.id))).toThrow(OwnershipError);
  });

  it("scoped reads only return the tenant's rows", () => {
    createStore("a", { name: "A", marketplace: "trendyol" });
    createStore("b", { name: "B", marketplace: "trendyol" });
    expect(scoped(readDB(), "a").stores.map((s) => s.name)).toEqual(["A"]);
  });

  it("manually entered rows are marked manual and unverified", () => {
    const s = createStore("t", { name: "1", marketplace: "trendyol" });
    const o = upsertOrder("t", order(s.id));
    expect(o.source).toBe("manual");
    expect(o.verified).toBe(false);
    expect(s.connectionStatus).toBe("not_connected");
  });

  it("deleting a store removes its records", () => {
    const s = createStore("t", { name: "1", marketplace: "trendyol" });
    upsertOrder("t", order(s.id));
    deleteStore("t", s.id);
    expect(readDB().orders).toHaveLength(0);
  });
});
