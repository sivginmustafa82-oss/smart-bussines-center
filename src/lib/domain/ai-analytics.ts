import {
  calculateProfit,
  filterExpenses,
  filterRecords,
  inRange,
  recordIstanbulDate,
  type Filters,
  type ProfitBreakdown,
} from "./profitability";
import { calculateSalesSummary, type SalesSummary } from "./sales-summary";
import type {
  AdDailyPerformance,
  CustomerReviewRow,
  Expense,
  FunnelMetricRow,
  OrderRecord,
  Product,
} from "./types";
import {
  addDays,
  daysBetween,
  isDateOnlyInIstanbulRange,
  istanbulToday,
  isValidIsoDate,
} from "../../../supabase/functions/smart-business-api/trendyol-time";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface AiDateRange {
  from: string;
  to: string;
}

/** Default last 30 calendar days in Europe/Istanbul (both endpoints inclusive). */
export function defaultAiDateRange(nowMs: number = Date.now()): AiDateRange {
  const to = istanbulToday(nowMs);
  return { from: addDays(to, -29), to };
}

export function validateAiDateRange(from: string, to: string): { valid: boolean; error: string | null; days: number } {
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
    return { valid: false, error: "Başlangıç ve bitiş tarihi geçerli YYYY-AA-GG biçiminde olmalı.", days: 0 };
  }
  const diff = daysBetween(from, to);
  if (diff < 0) {
    return { valid: false, error: "Başlangıç tarihi bitiş tarihinden sonra olamaz.", days: 0 };
  }
  return { valid: true, error: null, days: diff + 1 };
}

const BARCODE_NOTE_RE = /Barkod:\s*([^\s|]+)/i;

/** Extracts real Trendyol barcode recorded in OrderRecord.note when present. */
export function extractBarcodeFromNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const m = BARCODE_NOTE_RE.exec(note);
  const val = m?.[1]?.trim();
  return val ? val : null;
}

export interface DailyTrendPoint {
  date: string;
  grossSales: number;
  netSales: number;
  netProfit: number;
  netUnits: number;
}

export function analyzeDailyTrend(
  records: OrderRecord[],
  expenses: Expense[],
  products: Product[],
): DailyTrendPoint[] {
  const byDayOrders = new Map<string, OrderRecord[]>();
  const byDayExpenses = new Map<string, Expense[]>();
  const days = new Set<string>();

  for (const r of records) {
    const d = recordIstanbulDate(r);
    days.add(d);
    const list = byDayOrders.get(d) ?? [];
    list.push(r);
    byDayOrders.set(d, list);
  }
  for (const e of expenses) {
    days.add(e.date);
    const list = byDayExpenses.get(e.date) ?? [];
    list.push(e);
    byDayExpenses.set(e.date, list);
  }

  return [...days].sort().map((date) => {
    const dayRecords = byDayOrders.get(date) ?? [];
    const dayExpenses = byDayExpenses.get(date) ?? [];
    const pb = calculateProfit(dayRecords, dayExpenses, products);
    return {
      date,
      grossSales: pb.grossSales,
      netSales: pb.netSales,
      netProfit: pb.netProfit,
      netUnits: pb.counts.soldUnits - pb.counts.returnedUnits - pb.counts.cancelledUnits,
    };
  });
}

export interface VariantPerformance {
  barcode: string;
  sku: string;
  variantName: string;
  salePrice: number | null;
  listPrice: number | null;
  stock: number | null;
  grossUnits: number;
  returnedUnits: number;
  cancelledUnits: number;
  netUnits: number;
  grossAmount: number;
  netSales: number;
  returnRate: number | null;
  duplicateName: boolean;
}

export interface ProductPerformanceRow {
  productId: string | null;
  name: string;
  sku: string;
  barcode: string;
  storeId: string;
  category: string | null;
  unitCost: number | null;
  grossUnits: number;
  returnedUnits: number;
  cancelledUnits: number;
  netUnits: number;
  grossSales: number;
  returnsAmount: number;
  cancellationsAmount: number;
  discountsAmount: number;
  netSales: number;
  commission: number;
  shipping: number;
  taxes: number;
  productCost: number | null;
  /** Null whenever product unitCost is missing — never fabricated. */
  netContribution: number | null;
  margin: number | null;
  profitStatus: "calculated" | "missing_cost" | "no_sales";
  returnRate: number | null;
  cancellationRate: number | null;
  variants: VariantPerformance[];
}

export interface ProductAnalysis {
  all: ProductPerformanceRow[];
  topSellers: ProductPerformanceRow[];
  topProfitable: ProductPerformanceRow[];
  missingCostProducts: ProductPerformanceRow[];
  unsoldProducts: ProductPerformanceRow[];
  variantComparisons: ProductPerformanceRow[];
}

export function analyzeProductsAndVariants(
  records: OrderRecord[],
  products: Product[],
  storeId: string | "all",
): ProductAnalysis {
  const scopedProducts = products.filter((p) => storeId === "all" || p.storeId === storeId);
  const productById = new Map(scopedProducts.map((p) => [p.id, p]));
  const recordsByProduct = new Map<string, OrderRecord[]>();

  for (const r of records) {
    const key = r.productId ?? "__unlinked__";
    const list = recordsByProduct.get(key) ?? [];
    list.push(r);
    recordsByProduct.set(key, list);
  }

  const keys = new Set<string>([...scopedProducts.map((p) => p.id), ...recordsByProduct.keys()]);
  const all: ProductPerformanceRow[] = [];

  for (const key of keys) {
    const product = key === "__unlinked__" ? undefined : productById.get(key);
    const prodRecords = recordsByProduct.get(key) ?? [];
    if (!product && prodRecords.length === 0) continue;

    const summary = calculateSalesSummary(prodRecords);
    const pb = calculateProfit(prodRecords, [], scopedProducts);
    const hasSales = summary.gross.units > 0;
    const hasCost = product?.unitCost != null && pb.missingCostRecords === 0;

    const profitStatus: ProductPerformanceRow["profitStatus"] = !hasSales
      ? "no_sales"
      : hasCost
        ? "calculated"
        : "missing_cost";
    const netContribution =
      profitStatus === "calculated"
        ? round2(pb.netSales - pb.commission - pb.shipping - pb.taxes - pb.productCost)
        : null;
    const margin =
      netContribution != null && pb.netSales > 0 ? netContribution / pb.netSales : null;

    // Build per-barcode/variant comparison from real catalog variants + order note barcodes
    const variantRecords = new Map<string, OrderRecord[]>();
    for (const r of prodRecords) {
      const bc = extractBarcodeFromNote(r.note) ?? product?.barcode ?? "";
      if (!bc) continue;
      const list = variantRecords.get(bc) ?? [];
      list.push(r);
      variantRecords.set(bc, list);
    }

    const catalogVariants = product?.variants ?? [];
    const nameCounts = new Map<string, number>();
    for (const v of catalogVariants) {
      const norm = v.name.trim().toLowerCase();
      if (norm) nameCounts.set(norm, (nameCounts.get(norm) ?? 0) + 1);
    }

    const seenBarcodes = new Set<string>();
    const variants: VariantPerformance[] = [];

    for (const v of catalogVariants) {
      const bc = v.barcode.trim();
      if (bc) seenBarcodes.add(bc);
      const vRecs = bc ? (variantRecords.get(bc) ?? []) : [];
      const vs = calculateSalesSummary(vRecs);
      const normName = v.name.trim().toLowerCase();
      variants.push({
        barcode: bc || "—",
        sku: v.sku || "",
        variantName: v.name || "Standart",
        salePrice: v.salePrice,
        listPrice: v.listPrice,
        stock: v.stock,
        grossUnits: vs.gross.units,
        returnedUnits: vs.returns.units,
        cancelledUnits: vs.cancellations.units,
        netUnits: vs.net.units,
        grossAmount: vs.gross.amount,
        netSales: vs.net.amount,
        returnRate: vs.gross.units > 0 ? vs.returns.units / vs.gross.units : null,
        duplicateName: normName ? (nameCounts.get(normName) ?? 0) > 1 : false,
      });
    }

    for (const [bc, vRecs] of variantRecords.entries()) {
      if (seenBarcodes.has(bc)) continue;
      const vs = calculateSalesSummary(vRecs);
      variants.push({
        barcode: bc,
        sku: "",
        variantName: "Katalogda eşleşmeyen barkod",
        salePrice: null,
        listPrice: null,
        stock: null,
        grossUnits: vs.gross.units,
        returnedUnits: vs.returns.units,
        cancelledUnits: vs.cancellations.units,
        netUnits: vs.net.units,
        grossAmount: vs.gross.amount,
        netSales: vs.net.amount,
        returnRate: vs.gross.units > 0 ? vs.returns.units / vs.gross.units : null,
        duplicateName: false,
      });
    }

    variants.sort((a, b) => b.netSales - a.netSales || b.grossUnits - a.grossUnits);

    all.push({
      productId: product?.id ?? null,
      name: product?.name ?? "Ürün eşleşmemiş kayıtlar",
      sku: product?.sku ?? "",
      barcode: product?.barcode ?? "",
      storeId: product?.storeId ?? prodRecords[0]?.storeId ?? "",
      category: product?.category ?? null,
      unitCost: product?.unitCost ?? null,
      grossUnits: summary.gross.units,
      returnedUnits: summary.returns.units,
      cancelledUnits: summary.cancellations.units,
      netUnits: summary.net.units,
      grossSales: summary.gross.amount,
      returnsAmount: summary.returns.amount,
      cancellationsAmount: summary.cancellations.amount,
      discountsAmount: summary.discounts.amount,
      netSales: summary.net.amount,
      commission: pb.commission,
      shipping: pb.shipping,
      taxes: pb.taxes,
      productCost: hasCost ? pb.productCost : null,
      netContribution,
      margin,
      profitStatus,
      returnRate: summary.gross.units > 0 ? summary.returns.units / summary.gross.units : null,
      cancellationRate: summary.gross.units > 0 ? summary.cancellations.units / summary.gross.units : null,
      variants,
    });
  }

  const topSellers = [...all]
    .filter((p) => p.grossUnits > 0)
    .sort((a, b) => b.netUnits - a.netUnits || b.netSales - a.netSales);

  const topProfitable = [...all]
    .filter((p) => p.grossUnits > 0)
    .sort((a, b) => {
      if (a.netContribution != null && b.netContribution != null) return b.netContribution - a.netContribution;
      if (a.netContribution != null) return -1;
      if (b.netContribution != null) return 1;
      return b.netSales - a.netSales;
    });

  const missingCostProducts = all.filter((p) => p.profitStatus === "missing_cost");
  const unsoldProducts = all.filter((p) => p.productId != null && p.grossUnits === 0);
  const variantComparisons = all
    .filter((p) => p.variants.length > 1)
    .sort((a, b) => b.netSales - a.netSales || b.variants.length - a.variants.length);

  return { all, topSellers, topProfitable, missingCostProducts, unsoldProducts, variantComparisons };
}

export interface DiscountCouponAnalysis {
  sellerDiscountGross: number;
  couponDiscountGross: number;
  returnedDiscountReversal: number;
  netDiscounts: number;
  discountedSaleLines: number;
  totalSaleLines: number;
  discountedOrderShare: number | null;
  discountRateOfGross: number | null;
  impactSummary: string;
}

export function analyzeDiscountsAndCoupons(records: OrderRecord[], summary: SalesSummary): DiscountCouponAnalysis {
  let sellerDiscountGross = 0;
  let couponDiscountGross = 0;
  let discountedSaleLines = 0;
  let totalSaleLines = 0;

  for (const r of records) {
    if (r.type !== "sale") continue;
    totalSaleLines += 1;
    sellerDiscountGross += r.discountAmount;
    couponDiscountGross += r.couponAmount;
    if (r.discountAmount > 0 || r.couponAmount > 0) discountedSaleLines += 1;
  }

  const discountedOrderShare = totalSaleLines > 0 ? discountedSaleLines / totalSaleLines : null;
  const discountRateOfGross = summary.gross.amount > 0 ? summary.discounts.amount / summary.gross.amount : null;

  const impactSummary =
    summary.discounts.amount > 0
      ? "Satıcı indirimi ve kuponlar brüt satıştan düşülerek net satışı azaltır; onaylı iadelere ait indirim payı geri eklenir. İptal paketlerinin indirimleri Trendyol kuralıyla uyumlu şekilde toplam indirime dahil edilmez."
      : "Seçili tarih aralığında kayıtlara yansıyan net indirim/kupon bulunmuyor.";

  return {
    sellerDiscountGross: round2(sellerDiscountGross),
    couponDiscountGross: round2(couponDiscountGross),
    returnedDiscountReversal: summary.discounts.returned,
    netDiscounts: summary.discounts.amount,
    discountedSaleLines,
    totalSaleLines,
    discountedOrderShare,
    discountRateOfGross,
    impactSummary,
  };
}

export interface FunnelOpportunity {
  productId: string | null;
  productName: string;
  kind: "high_views_low_orders" | "high_cart_low_orders";
  views: number;
  addToCart: number;
  orders: number;
  conversionRate: number | null;
  cartToOrderRate: number | null;
  reason: string;
}

export interface FunnelAnalysis {
  hasFunnelData: boolean;
  views: number | null;
  addToCart: number | null;
  /** Real distinct sale order count from order_records in the selected period. */
  ordersFromRecords: number;
  /** Orders reported in funnel telemetry when available. */
  funnelOrders: number | null;
  conversionRate: number | null;
  cartToOrderRate: number | null;
  opportunities: FunnelOpportunity[];
  missingDataNotice: string | null;
}

export function analyzeFunnel(
  records: OrderRecord[],
  funnelRows: FunnelMetricRow[],
  products: Product[],
  filters: Filters,
): FunnelAnalysis {
  const distinctSaleOrders = new Set(records.filter((r) => r.type === "sale").map((r) => r.orderNumber)).size;
  const scopedRows = funnelRows.filter(
    (row) => (filters.storeId === "all" || row.storeId === filters.storeId) && isDateOnlyInIstanbulRange(row.date, filters),
  );

  if (scopedRows.length === 0) {
    return {
      hasFunnelData: false,
      views: null,
      addToCart: null,
      ordersFromRecords: distinctSaleOrders,
      funnelOrders: null,
      conversionRate: null,
      cartToOrderRate: null,
      opportunities: [],
      missingDataNotice:
        "Görüntülenme ve sepete ekleme verisi henüz yok — Trendyol'dan alınması gerekiyor. Yalnızca mevcut sipariş adedi gerçek kayıtlardan gösterilir.",
    };
  }

  let views = 0;
  let addToCart = 0;
  let funnelOrders = 0;
  const byProduct = new Map<string, { views: number; addToCart: number; orders: number }>();

  for (const row of scopedRows) {
    views += row.views;
    addToCart += row.addToCart;
    funnelOrders += row.orders;
    const key = row.productId ?? "__store__";
    const cur = byProduct.get(key) ?? { views: 0, addToCart: 0, orders: 0 };
    cur.views += row.views;
    cur.addToCart += row.addToCart;
    cur.orders += row.orders;
    byProduct.set(key, cur);
  }

  const productNames = new Map(products.map((p) => [p.id, p.name]));
  const opportunities: FunnelOpportunity[] = [];

  for (const [key, agg] of byProduct.entries()) {
    const conv = agg.views > 0 ? agg.orders / agg.views : null;
    const cartConv = agg.addToCart > 0 ? agg.orders / agg.addToCart : null;
    const productName = key === "__store__" ? "Mağaza geneli" : (productNames.get(key) ?? "Ürün");

    if (agg.views >= 100 && conv != null && conv < 0.015) {
      opportunities.push({
        productId: key === "__store__" ? null : key,
        productName,
        kind: "high_views_low_orders",
        views: agg.views,
        addToCart: agg.addToCart,
        orders: agg.orders,
        conversionRate: conv,
        cartToOrderRate: cartConv,
        reason: `${agg.views} görüntülenmeye karşın ${agg.orders} sipariş oluştu (%${(conv * 100).toFixed(2)} dönüşüm).`,
      });
    } else if (agg.addToCart >= 15 && cartConv != null && cartConv < 0.15) {
      opportunities.push({
        productId: key === "__store__" ? null : key,
        productName,
        kind: "high_cart_low_orders",
        views: agg.views,
        addToCart: agg.addToCart,
        orders: agg.orders,
        conversionRate: conv,
        cartToOrderRate: cartConv,
        reason: `${agg.addToCart} sepete eklemeye karşın ${agg.orders} sipariş tamamlandı (%${(cartConv * 100).toFixed(1)} sepet dönüşümü).`,
      });
    }
  }

  return {
    hasFunnelData: true,
    views,
    addToCart,
    ordersFromRecords: distinctSaleOrders,
    funnelOrders,
    conversionRate: views > 0 ? funnelOrders / views : null,
    cartToOrderRate: addToCart > 0 ? funnelOrders / addToCart : null,
    opportunities,
    missingDataNotice: null,
  };
}

export interface AdCampaignSummary {
  campaignName: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  ordersCount: number;
  roas: number | null;
  ctr: number | null;
}

export interface AdvertisingAnalysis {
  hasPlatformAdData: boolean;
  platformSpend: number | null;
  platformRevenue: number | null;
  impressions: number | null;
  clicks: number | null;
  adOrders: number | null;
  /** Null whenever spend <= 0 or platform ad revenue is absent — never fabricated. */
  roas: number | null;
  manualAdExpense: number;
  campaigns: AdCampaignSummary[];
  /** Pre-ad contribution margin (only when all sales have costs and netSales > 0). */
  contributionMarginBeforeAds: number | null;
  breakEvenRoas: number | null;
  targetRoas: number | null;
  targetNetMarginPct: number;
  guidanceNote: string;
  missingDataNotice: string | null;
}

export function analyzeAdvertising(
  adRows: AdDailyPerformance[],
  breakdown: ProfitBreakdown,
  filters: Filters,
  targetNetMarginPct: number,
): AdvertisingAnalysis {
  const scopedAds = adRows.filter(
    (row) => (filters.storeId === "all" || row.storeId === filters.storeId) && isDateOnlyInIstanbulRange(row.date, filters),
  );
  const manualAdExpense = breakdown.advertising;

  // Pre-ad contribution margin is strictly suppressed when product costs are incomplete
  const canComputeMargins = breakdown.netSales > 0 && breakdown.missingCostRecords === 0;
  const contributionBeforeAds =
    breakdown.netSales - breakdown.commission - breakdown.shipping - breakdown.taxes - breakdown.productCost;
  const contributionMarginBeforeAds = canComputeMargins ? contributionBeforeAds / breakdown.netSales : null;
  const targetMarginRatio = Math.max(0, Math.min(0.8, targetNetMarginPct / 100));

  const breakEvenRoas =
    contributionMarginBeforeAds != null && contributionMarginBeforeAds > 0
      ? round2(1 / contributionMarginBeforeAds)
      : null;
  const headroom =
    contributionMarginBeforeAds != null ? contributionMarginBeforeAds - targetMarginRatio : null;
  const targetRoas = headroom != null && headroom > 0 ? round2(1 / headroom) : null;

  let guidanceNote: string;
  if (!canComputeMargins) {
    guidanceNote =
      breakdown.netSales <= 0
        ? "Seçili aralıkta net satış olmadığı için başabaş ROAS hesaplanamadı."
        : `${breakdown.missingCostRecords} satış satırında ürün maliyeti eksik olduğundan başabaş/hedef ROAS hesaplanmadı. Ürün maliyetleri girildiğinde kâra göre ROAS eşiği otomatik hesaplanır.`;
  } else if (breakEvenRoas == null) {
    guidanceNote =
      "Reklam öncesi ürün katkı marjı sıfır veya negatif olduğu için reklam harcaması kârlı olmaz; önce fiyat/komisyon/maliyet dengesi incelenmeli.";
  } else if (targetRoas == null) {
    guidanceNote = `Reklam öncesi katkı marjınız %${(contributionMarginBeforeAds! * 100).toFixed(1)} (başabaş ROAS: ${breakEvenRoas.toFixed(2)}x). Seçtiğiniz %${targetNetMarginPct} hedef net marjı mevcut katkı marjının üzerinde olduğu için hedef ROAS hesaplanamıyor.`;
  } else {
    guidanceNote = `Reklam öncesi katkı marjı %${(contributionMarginBeforeAds! * 100).toFixed(1)} üzerinden başabaş ROAS ${breakEvenRoas.toFixed(2)}x, %${targetNetMarginPct} hedef kâr marjı için gereken minimum ROAS ${targetRoas.toFixed(2)}x olarak hesaplanır. Bütçe değişikliği otomatik yapılmaz.`;
  }

  if (scopedAds.length === 0) {
    return {
      hasPlatformAdData: false,
      platformSpend: null,
      platformRevenue: null,
      impressions: null,
      clicks: null,
      adOrders: null,
      roas: null,
      manualAdExpense,
      campaigns: [],
      contributionMarginBeforeAds,
      breakEvenRoas,
      targetRoas,
      targetNetMarginPct,
      guidanceNote,
      missingDataNotice:
        manualAdExpense > 0
          ? "Trendyol reklam performans verisi (reklam geliri, tıklama, gösterim) henüz bağlı değil; ROAS hesaplanamadı. Giderler ekranındaki manuel reklam gideri ayrıca gösteriliyor."
          : "Reklam performans verisi henüz yok — Trendyol'dan alınması gerekiyor. ROAS hesaplanmadı.",
    };
  }

  let spend = 0;
  let revenue = 0;
  let impressions = 0;
  let clicks = 0;
  let adOrders = 0;
  const byCamp = new Map<string, AdCampaignSummary>();

  for (const row of scopedAds) {
    spend += row.spend;
    revenue += row.revenue;
    impressions += row.impressions;
    clicks += row.clicks;
    adOrders += row.ordersCount;
    const name = row.campaignName?.trim() || row.externalCampaignId || "İsimsiz kampanya";
    const cur = byCamp.get(name) ?? {
      campaignName: name,
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      ordersCount: 0,
      roas: null,
      ctr: null,
    };
    cur.spend = round2(cur.spend + row.spend);
    cur.revenue = round2(cur.revenue + row.revenue);
    cur.impressions += row.impressions;
    cur.clicks += row.clicks;
    cur.ordersCount += row.ordersCount;
    cur.roas = cur.spend > 0 ? round2(cur.revenue / cur.spend) : null;
    cur.ctr = cur.impressions > 0 ? cur.clicks / cur.impressions : null;
    byCamp.set(name, cur);
  }

  const campaigns = [...byCamp.values()].sort((a, b) => b.spend - a.spend);

  return {
    hasPlatformAdData: true,
    platformSpend: round2(spend),
    platformRevenue: round2(revenue),
    impressions,
    clicks,
    adOrders,
    roas: spend > 0 ? round2(revenue / spend) : null,
    manualAdExpense,
    campaigns,
    contributionMarginBeforeAds,
    breakEvenRoas,
    targetRoas,
    targetNetMarginPct,
    guidanceNote,
    missingDataNotice: null,
  };
}

/** Helper that applies the exact same Europe/Istanbul filter rules to orders and expenses. */
export function filterWorkspaceForAi(
  orders: OrderRecord[],
  expenses: Expense[],
  filters: Filters,
): { records: OrderRecord[]; expenses: Expense[] } {
  return {
    records: filterRecords(orders, filters),
    expenses: filterExpenses(expenses, filters),
  };
}

export { inRange, type CustomerReviewRow };