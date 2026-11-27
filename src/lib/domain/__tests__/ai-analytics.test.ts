import { describe, expect, it } from "vitest";
import {
  analyzeAdvertising,
  analyzeFunnel,
  analyzeProductsAndVariants,
  defaultAiDateRange,
  extractBarcodeFromNote,
  validateAiDateRange,
} from "../ai-analytics";
import { computeAiReport } from "../ai-insights";
import type { AdDailyPerformance, Expense, OrderRecord, Product } from "../types";

const mkProduct = (overrides: Partial<Product> = {}): Product => ({
  id: "prod-1",
  tenantId: "t1",
  storeId: "s1",
  name: "Full Ortopedik Tek Kişilik Yatak Pedi 8 cm",
  sku: "SKU-1",
  barcode: "111",
  unitCost: 400,
  vatRate: 10,
  source: "imported",
  verified: true,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  category: "Yatak Pedi",
  variants: [
    { id: "v1", barcode: "111", sku: "SKU-90", name: "90 x 190", salePrice: 1000, listPrice: 1200, stock: 50 },
    { id: "v2", barcode: "222", sku: "SKU-180", name: "180 x 200 cm", salePrice: 1800, listPrice: 2000, stock: 20 },
    { id: "v3", barcode: "333", sku: "", name: "90 x 190", salePrice: null, listPrice: null, stock: 0 },
  ],
  ...overrides,
});

const mkOrder = (overrides: Partial<OrderRecord> = {}): OrderRecord => ({
  id: "o-1",
  tenantId: "t1",
  storeId: "s1",
  type: "sale",
  orderNumber: "ORD-1",
  date: "2026-10-15",
  productId: "prod-1",
  quantity: 1,
  grossAmount: 1000,
  discountAmount: 100,
  couponAmount: 0,
  commissionAmount: 180,
  shippingAmount: 50,
  withholdingAmount: 10,
  note: "Paket:1 | Barkod:111 | Komisyon oranı:%20",
  source: "imported",
  verified: true,
  createdAt: "2026-10-15T10:00:00Z",
  ...overrides,
});

describe("Yapay Zekâ Verileri — tarih aralığı, oranlar, eksik veri ve kâr hesapları", () => {
  it("Europe/Istanbul varsayılan 30 gün aralığını ve bitiş günü dahil filtrelemeyi doğru uygular", () => {
    // 2026-10-31 00:30 TR = 2026-10-30T21:30:00.000Z
    const nowMs = Date.parse("2026-10-30T21:30:00.000Z");
    expect(defaultAiDateRange(nowMs)).toEqual({ from: "2026-10-02", to: "2026-10-31" });
    expect(validateAiDateRange("2026-10-15", "2026-10-10").valid).toBe(false);
    expect(validateAiDateRange("2026-10-01", "2026-10-31")).toEqual({ valid: true, error: null, days: 31 });

    const endDayLateOrder = mkOrder({
      id: "end-late",
      orderNumber: "END-1",
      date: "2026-10-31",
      orderedAt: "2026-10-31T20:59:59.000Z", // 2026-10-31 23:59:59 TR -> dahil
      grossAmount: 1000,
    });
    const nextDayEarlyOrder = mkOrder({
      id: "next-early",
      orderNumber: "NEXT-1",
      date: "2026-11-01",
      orderedAt: "2026-10-31T21:00:00.000Z", // 2026-11-01 00:00:00 TR -> hariç
      grossAmount: 2000,
    });

    const report = computeAiReport({
      orders: [endDayLateOrder, nextDayEarlyOrder],
      expenses: [],
      products: [mkProduct()],
      adRows: [],
      funnelRows: [],
      reviews: [],
      competitors: [],
      filters: { storeId: "all", from: "2026-10-01", to: "2026-10-31" },
      targetNetMarginPct: 15,
    });

    expect(report.recordCount).toBe(1);
    expect(report.summary.gross.amount).toBe(1000);
  });

  it("maliyeti eksik ürünlerde kârı uydurmaz ve 'missing_cost' olarak işaretler", () => {
    const costed = mkProduct({ id: "p-costed", unitCost: 300 });
    const uncosted = mkProduct({ id: "p-missing", name: "Maliyetsiz Ürün", unitCost: null });
    const unsold = mkProduct({ id: "p-unsold", name: "Satmayan Ürün", unitCost: 200 });

    const orders = [
      mkOrder({ id: "o1", productId: "p-costed", grossAmount: 1000, discountAmount: 100, commissionAmount: 180, shippingAmount: 50, withholdingAmount: 10 }),
      mkOrder({ id: "o2", orderNumber: "ORD-2", productId: "p-missing", grossAmount: 800, discountAmount: 0, commissionAmount: 160, shippingAmount: 40, withholdingAmount: 8 }),
    ];

    const analysis = analyzeProductsAndVariants(orders, [costed, uncosted, unsold], "all");
    const pCosted = analysis.all.find((p) => p.productId === "p-costed")!;
    const pMissing = analysis.all.find((p) => p.productId === "p-missing")!;

    // netSales 900 - comm 180 - ship 50 - tax 10 - cost 300 = 360
    expect(pCosted.profitStatus).toBe("calculated");
    expect(pCosted.netContribution).toBe(360);
    expect(pCosted.margin).toBeCloseTo(360 / 900, 4);

    expect(pMissing.profitStatus).toBe("missing_cost");
    expect(pMissing.netContribution).toBeNull();
    expect(pMissing.margin).toBeNull();
    expect(analysis.unsoldProducts.map((p) => p.productId)).toEqual(["p-unsold"]);
  });

  it("eksik huni, reklam, yorum ve rakip verilerinde sayı uydurmaz; veri geldiğinde oranları doğru hesaplar", () => {
    const prod = mkProduct({ unitCost: 400 });
    const orders = [
      mkOrder({
        id: "s1",
        grossAmount: 1000,
        discountAmount: 0,
        commissionAmount: 200,
        shippingAmount: 50,
        withholdingAmount: 0,
      }),
    ];
    const expenses: Expense[] = [
      { id: "e1", tenantId: "t1", storeId: "s1", date: "2026-10-15", category: "reklam", amount: 100, description: "Manuel reklam", source: "manual", createdAt: "2026-10-15T00:00:00Z" },
    ];

    const emptyReport = computeAiReport({
      orders,
      expenses,
      products: [prod],
      adRows: [],
      funnelRows: [],
      reviews: [],
      competitors: [],
      filters: { storeId: "all", from: "2026-10-01", to: "2026-10-31" },
      targetNetMarginPct: 15,
    });

    expect(emptyReport.funnel.hasFunnelData).toBe(false);
    expect(emptyReport.funnel.views).toBeNull();
    expect(emptyReport.funnel.conversionRate).toBeNull();
    expect(emptyReport.funnel.ordersFromRecords).toBe(1);

    expect(emptyReport.advertising.hasPlatformAdData).toBe(false);
    expect(emptyReport.advertising.roas).toBeNull();
    expect(emptyReport.advertising.manualAdExpense).toBe(100);
    // Contribution before ads = 1000 - 200 - 50 - 400 = 350 -> 35% -> breakEven ROAS = 1 / 0.35 = 2.86, target ROAS (15% net) = 1 / 0.20 = 5.00
    expect(emptyReport.advertising.breakEvenRoas).toBe(2.86);
    expect(emptyReport.advertising.targetRoas).toBe(5);

    expect(emptyReport.reviewsAndReturns.hasReviewData).toBe(false);
    expect(emptyReport.competitors.hasData).toBe(false);

    // When real ad & funnel rows exist, ROAS and conversion calculate properly
    const adRows: AdDailyPerformance[] = [
      { id: "a1", storeId: "s1", externalCampaignId: "c1", campaignName: "Marka", date: "2026-10-15", spend: 250, revenue: 1250, impressions: 5000, clicks: 100, ordersCount: 5, currency: "TRY" },
    ];
    const adResult = analyzeAdvertising(adRows, emptyReport.breakdown, { storeId: "all", from: "2026-10-01", to: "2026-10-31" }, 15);
    expect(adResult.hasPlatformAdData).toBe(true);
    expect(adResult.roas).toBe(5);

    const funnelResult = analyzeFunnel(
      orders,
      [{ storeId: "s1", productId: "prod-1", date: "2026-10-15", views: 500, addToCart: 30, orders: 2 }],
      [prod],
      { storeId: "all", from: "2026-10-01", to: "2026-10-31" },
    );
    expect(funnelResult.hasFunnelData).toBe(true);
    expect(funnelResult.conversionRate).toBeCloseTo(2 / 500, 5);
    expect(funnelResult.opportunities).toHaveLength(1);
  });

  it("barkod eşleştirmesi, yinelenen varyant ve başlık çelişki sinyallerini doğru tespit eder", () => {
    expect(extractBarcodeFromNote("Paket:1 | Barkod:4414785614256 | Durum:Delivered")).toBe("4414785614256");
    const prod = mkProduct();
    const report = computeAiReport({
      orders: [
        mkOrder({ id: "o1", note: "Paket:1 | Barkod:111", grossAmount: 1000, discountAmount: 0 }),
        mkOrder({ id: "o2", orderNumber: "ORD-2", note: "Paket:2 | Barkod:222", grossAmount: 1800, discountAmount: 0 }),
      ],
      expenses: [],
      products: [prod],
      adRows: [],
      funnelRows: [],
      reviews: [],
      competitors: [],
      filters: { storeId: "all", from: "2026-10-01", to: "2026-10-31" },
      targetNetMarginPct: 15,
    });

    expect(report.products.variantComparisons).toHaveLength(1);
    expect(report.listing.some((l) => l.id.startsWith("dup-variant:"))).toBe(true);
    expect(report.listing.some((l) => l.id.startsWith("title-size-conflict:"))).toBe(true);
    expect(report.executive.opportunities.length).toBeGreaterThan(0);
    expect(report.executive.opportunities.length).toBeLessThanOrEqual(3);
    expect(report.executive.risks.length).toBeLessThanOrEqual(3);
    expect(report.executive.actions.length).toBeLessThanOrEqual(3);
  });
});