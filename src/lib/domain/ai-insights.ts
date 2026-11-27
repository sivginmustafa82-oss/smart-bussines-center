import {
  analyzeAdvertising,
  analyzeDailyTrend,
  analyzeDiscountsAndCoupons,
  analyzeFunnel,
  analyzeProductsAndVariants,
  filterWorkspaceForAi,
  inRange,
  type AdvertisingAnalysis,
  type DailyTrendPoint,
  type DiscountCouponAnalysis,
  type FunnelAnalysis,
  type ProductAnalysis,
  type ProductPerformanceRow,
} from "./ai-analytics";
import { calculateProfit, type Filters, type ProfitBreakdown } from "./profitability";
import { calculateSalesSummary, type SalesSummary } from "./sales-summary";
import type {
  AdDailyPerformance,
  CompetitorEntry,
  CustomerReviewRow,
  Expense,
  FunnelMetricRow,
  OrderRecord,
  Product,
} from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ListingChecklistItem {
  id: string;
  productId: string | null;
  productName: string;
  area: "olcu_varyant" | "baslik_netlik" | "iade_sinyali" | "gorsel_aciklama";
  severity: "yuksek" | "orta" | "bilgi";
  title: string;
  detail: string;
  signal: string;
  dataSource: string;
}

const DOUBLE_SIZE_RE = /\b(140|150|160|180|200)\s*[x×]\s*(190|200)\b/i;
const THICKNESS_RE = /\b\d+\s*cm\b/i;

export function analyzeListingChecklist(
  products: Product[],
  productAnalysis: ProductAnalysis,
  storeId: string | "all",
): ListingChecklistItem[] {
  const scopedProducts = products.filter((p) => storeId === "all" || p.storeId === storeId);
  const perfById = new Map(productAnalysis.all.filter((p) => p.productId).map((p) => [p.productId!, p]));
  const items: ListingChecklistItem[] = [];

  for (const product of scopedProducts) {
    const perf = perfById.get(product.id);
    const variants = product.variants ?? [];
    const titleLower = product.name.toLocaleLowerCase("tr-TR");

    // 1. Duplicate variant names (e.g., same dimension listed on two barcodes)
    const nameMap = new Map<string, number>();
    let zeroStockNoPriceDupes = 0;
    for (const v of variants) {
      const norm = v.name.trim().toLowerCase();
      if (!norm) continue;
      nameMap.set(norm, (nameMap.get(norm) ?? 0) + 1);
      if (v.stock === 0 && v.salePrice == null) zeroStockNoPriceDupes += 1;
    }
    const duplicateNames = [...nameMap.entries()].filter(([, count]) => count > 1);
    if (duplicateNames.length > 0) {
      items.push({
        id: `dup-variant:${product.id}`,
        productId: product.id,
        productName: product.name,
        area: "olcu_varyant",
        severity: "yuksek",
        title: "Aynı ölçü/varyant adı birden fazla barkodda görünüyor",
        detail: `Müşteri seçim ekranında karışıklık ve stok/fiyat kopukluğu oluşmaması için yinelenen ölçü barkodlarını Trendyol satıcı panelinde kontrol edin (ör. ${duplicateNames.slice(0, 3).map(([n]) => n).join(", ")}).`,
        signal: `${duplicateNames.length} farklı ölçü adı yineleniyor; toplam ${variants.length} varyanttan ${zeroStockNoPriceDupes} tanesinde stok 0 ve satış fiyatı boş.`,
        dataSource: "Trendyol ürün kataloğu (product_variants)",
      });
    }

    // 2. Title says "Tek Kişilik" while variants include double/king sizes
    const hasDoubleVariant = variants.some((v) => DOUBLE_SIZE_RE.test(v.name));
    if (titleLower.includes("tek kişilik") && hasDoubleVariant) {
      items.push({
        id: `title-size-conflict:${product.id}`,
        productId: product.id,
        productName: product.name,
        area: "baslik_netlik",
        severity: "yuksek",
        title: "Başlık 'Tek Kişilik' derken çift kişilik ölçüler listeleniyor",
        detail: "Başlık ile ölçü seçeneklerinin çelişmesi yanlış ölçü siparişine ve iade artışına yol açabilir. Trendyol panelinde başlık-varyant uyumunu gözden geçirin.",
        signal: `Başlıkta 'Tek Kişilik' geçiyor ancak varyantlarda 140x190 / 160x200 / 180x200 gibi çift kişilik ölçüler mevcut.`,
        dataSource: "Trendyol başlık & varyant verisi",
      });
    }

    // 3. Inconsistent unit formatting across variants (some with "cm", some without)
    const withCm = variants.filter((v) => /\bcm\b/i.test(v.name)).length;
    const withoutCm = variants.filter((v) => v.name.trim() && !/\bcm\b/i.test(v.name)).length;
    if (withCm > 0 && withoutCm > 0) {
      items.push({
        id: `unit-inconsistency:${product.id}`,
        productId: product.id,
        productName: product.name,
        area: "olcu_varyant",
        severity: "bilgi",
        title: "Varyant ölçü yazımı tutarsız ('cm' birimi bazılarında yok)",
        detail: "Tüm varyantlarda aynı ölçü biçimini (örn. '90 x 190 cm') kullanmak müşterinin doğru ölçüyü seçmesini kolaylaştırır.",
        signal: `${withCm} varyantta 'cm' var, ${withoutCm} varyantta birim yazmıyor.`,
        dataSource: "Trendyol ürün kataloğu (product_variants)",
      });
    }

    // 4. Missing thickness in title for mattress/pad products or typo "ortapedik"
    const catLower = (product.category ?? "").toLocaleLowerCase("tr-TR");
    if ((catLower.includes("yatak") || titleLower.includes("yatak") || titleLower.includes("ped")) && !THICKNESS_RE.test(product.name)) {
      items.push({
        id: `thickness-missing:${product.id}`,
        productId: product.id,
        productName: product.name,
        area: "baslik_netlik",
        severity: "orta",
        title: "Başlıkta kalınlık (cm) bilgisi görünmüyor",
        detail: "Yatak/ped kategorisinde kalınlık (cm) bilgisi başlıkta ve ilk görsellerde açıkça belirtilmediğinde beklenti farkına bağlı iadeler artabilir.",
        signal: `Kategori: '${product.category ?? "Belirtilmemiş"}'; ürün başlığında cm cinsinden kalınlık ifadesi tespit edilmedi.`,
        dataSource: "Trendyol ürün başlığı ve kategorisi",
      });
    }
    if (titleLower.includes("ortapedik")) {
      items.push({
        id: `typo-ortapedik:${product.id}`,
        productId: product.id,
        productName: product.name,
        area: "baslik_netlik",
        severity: "bilgi",
        title: "Başlıkta yazım hatası ('Ortapedik' → 'Ortopedik')",
        detail: "Arama görünürlüğü ve güven algısı için Trendyol panelinde başlık yazımını düzeltmeyi değerlendirin.",
        signal: `Mevcut başlık: "${product.name}".`,
        dataSource: "Trendyol ürün başlığı",
      });
    }

    // 5. High return / cancellation signal -> visual & description manual verification
    if (perf && perf.grossUnits >= 3 && ((perf.returnRate ?? 0) >= 0.1 || (perf.cancellationRate ?? 0) >= 0.1)) {
      items.push({
        id: `return-signal:${product.id}`,
        productId: product.id,
        productName: product.name,
        area: "iade_sinyali",
        severity: "yuksek",
        title: "Yüksek iade/iptal oranı: görsel ve açıklama netliği kontrol edilmeli",
        detail: "Ölçü tablosu, ürün kalınlığı, sertlik derecesi ve paket içi gerçek ürün görsellerini Trendyol panelinde gözden geçirin (görsel/açıklama metni API'den henüz çekilmediği için manuel kontrol önerilir).",
        signal: `Seçili dönemde ${perf.grossUnits} brüt adette ${perf.returnedUnits} iade (%${((perf.returnRate ?? 0) * 100).toFixed(1)}) ve ${perf.cancelledUnits} iptal (%${((perf.cancellationRate ?? 0) * 100).toFixed(1)}).`,
        dataSource: "Trendyol sipariş ve onaylı iade kayıtları",
      });
    } else if (perf && perf.grossUnits === 0 && variants.some((v) => v.stock > 0)) {
      items.push({
        id: `unsold-visual-check:${product.id}`,
        productId: product.id,
        productName: product.name,
        area: "gorsel_aciklama",
        severity: "orta",
        title: "Stoklu ürün seçili dönemde satış üretmedi (manuel görsel/açıklama kontrolü)",
        detail: "Kapak görseli, fiyat rekabeti ve ürün açıklamasını Trendyol panelinde kontrol edin. Görsel/açıklama içeriği API'den henüz alınmadığı için bu kontrol manuel yapılmalıdır.",
        signal: `Seçili tarih aralığında 0 sipariş; katalogda stoklu varyant bulunuyor.`,
        dataSource: "Trendyol katalog + sipariş kayıtları",
      });
    }
  }

  const weight = { yuksek: 0, orta: 1, bilgi: 2 } as const;
  return items.sort((a, b) => weight[a.severity] - weight[b.severity]);
}

export interface ReviewThemeCount {
  theme: string;
  kind: "sikayet" | "ovgu";
  count: number;
}

export interface ReviewsAndReturnsAnalysis {
  hasReviewData: boolean;
  reviewCount: number;
  averageRating: number | null;
  ratingDistribution: { rating: number; count: number }[];
  reviewThemes: ReviewThemeCount[];
  reviewNotice: string | null;
  returns: {
    count: number;
    units: number;
    amount: number;
    rateOfGrossUnits: number | null;
  };
  cancellations: {
    count: number;
    units: number;
    amount: number;
    rateOfGrossUnits: number | null;
  };
  topIssueProducts: {
    productName: string;
    returnedUnits: number;
    cancelledUnits: number;
    grossUnits: number;
    issueRate: number;
  }[];
  returnReasonTextAvailable: boolean;
  returnReasonNotice: string;
}

const THEME_RULES: { theme: string; kind: "sikayet" | "ovgu"; pattern: RegExp }[] = [
  { theme: "Ölçü / ebat uyumsuzluğu", kind: "sikayet", pattern: /\b(ölçü|ebat|küçük|büyük|dar|kısa|uzun|uymadı|yanlış boyut)\b/i },
  { theme: "Kargo / teslimat / paketleme", kind: "sikayet", pattern: /\b(kargo|teslimat|geç geldi|yırtık|hasarlı|paket|ezik)\b/i },
  { theme: "Kalınlık / sertlik beklentisi", kind: "sikayet", pattern: /\b(ince|çok yumuşak|çok sert|kalınlık|çökme|rahatsız)\b/i },
  { theme: "Konfor / kalite memnuniyeti", kind: "ovgu", pattern: /\b(rahat|kaliteli|harika|mükemmel|tavsiye|çok beğendim|güzel)\b/i },
  { theme: "Hızlı teslimat / özenli paket", kind: "ovgu", pattern: /\b(hızlı kargo|hızlı geldi|özenli|sağlam geldi)\b/i },
];

export function analyzeReviewsAndReturns(
  records: OrderRecord[],
  summary: SalesSummary,
  productAnalysis: ProductAnalysis,
  reviews: CustomerReviewRow[],
  filters: Filters,
): ReviewsAndReturnsAnalysis {
  const scopedReviews = reviews.filter(
    (r) => (filters.storeId === "all" || r.storeId === filters.storeId) && inRange(r.date, filters),
  );

  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: scopedReviews.filter((r) => Math.round(r.rating) === rating).length,
  }));
  const averageRating =
    scopedReviews.length > 0
      ? round2(scopedReviews.reduce((acc, r) => acc + r.rating, 0) / scopedReviews.length)
      : null;

  const themeCounts = new Map<string, ReviewThemeCount>();
  for (const rev of scopedReviews) {
    for (const rule of THEME_RULES) {
      const matchesRating =
        (rule.kind === "sikayet" && rev.rating <= 3) || (rule.kind === "ovgu" && rev.rating >= 4);
      if (matchesRating && rule.pattern.test(rev.comment)) {
        const cur = themeCounts.get(rule.theme) ?? { theme: rule.theme, kind: rule.kind, count: 0 };
        cur.count += 1;
        themeCounts.set(rule.theme, cur);
      }
    }
  }

  const topIssueProducts = productAnalysis.all
    .filter((p) => p.returnedUnits + p.cancelledUnits > 0 && p.grossUnits > 0)
    .map((p) => ({
      productName: p.name,
      returnedUnits: p.returnedUnits,
      cancelledUnits: p.cancelledUnits,
      grossUnits: p.grossUnits,
      issueRate: (p.returnedUnits + p.cancelledUnits) / p.grossUnits,
    }))
    .sort((a, b) => b.returnedUnits + b.cancelledUnits - (a.returnedUnits + a.cancelledUnits))
    .slice(0, 6);

  // Check whether any return/cancellation note contains a human reason rather than only technical metadata
  const returnCancelRecords = records.filter((r) => r.type === "return" || r.type === "cancellation");
  const hasReasonText = returnCancelRecords.some((r) => /Sebep:|Neden:/i.test(r.note));

  return {
    hasReviewData: scopedReviews.length > 0,
    reviewCount: scopedReviews.length,
    averageRating,
    ratingDistribution,
    reviewThemes: [...themeCounts.values()].sort((a, b) => b.count - a.count),
    reviewNotice:
      scopedReviews.length === 0
        ? "Müşteri yorum verisi henüz yok — Trendyol'dan alınması gerekiyor. Yorum puanı ve tema analizi yorumlar bağlandığında bu tarih filtresiyle otomatik çalışacaktır."
        : null,
    returns: {
      count: summary.lines.returns,
      units: summary.returns.units,
      amount: summary.returns.amount,
      rateOfGrossUnits: summary.gross.units > 0 ? summary.returns.units / summary.gross.units : null,
    },
    cancellations: {
      count: summary.lines.cancellations,
      units: summary.cancellations.units,
      amount: summary.cancellations.amount,
      rateOfGrossUnits: summary.gross.units > 0 ? summary.cancellations.units / summary.gross.units : null,
    },
    topIssueProducts,
    returnReasonTextAvailable: hasReasonText,
    returnReasonNotice: hasReasonText
      ? "İade/iptal kayıtlarında sebep metni bulundu."
      : "Trendyol iade/iptal sebep metinleri şu an senkronizasyonda bulunmuyor; yalnızca gerçek iade/iptal adet, tutar ve ürün dağılımı gösteriliyor.",
  };
}

export interface CompetitorComparisonRow {
  entry: CompetitorEntry;
  linkedProductName: string | null;
  ourPriceRange: { min: number; max: number } | null;
  priceDiffVsMin: number | null;
}

export interface CompetitorAnalysis {
  hasData: boolean;
  rows: CompetitorComparisonRow[];
  emptyNotice: string | null;
}

export function analyzeCompetitors(
  entries: CompetitorEntry[],
  products: Product[],
  storeId: string | "all",
): CompetitorAnalysis {
  const scoped = entries.filter((e) => storeId === "all" || e.storeId === storeId);
  if (scoped.length === 0) {
    return {
      hasData: false,
      rows: [],
      emptyNotice: "Rakip verisi henüz eklenmedi. Uygulama rakip fiyatlarını uydurmaz; isterseniz kendi gözlemlerinizi manuel ekleyebilirsiniz.",
    };
  }
  const prodMap = new Map(products.map((p) => [p.id, p]));
  const rows: CompetitorComparisonRow[] = scoped.map((entry) => {
    const prod = entry.productId ? prodMap.get(entry.productId) : undefined;
    const prices = (prod?.variants ?? [])
      .map((v) => v.salePrice)
      .filter((p): p is number => p != null && p > 0);
    const ourPriceRange = prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
    return {
      entry,
      linkedProductName: prod?.name ?? null,
      ourPriceRange,
      priceDiffVsMin: ourPriceRange ? round2(ourPriceRange.min - entry.competitorPrice) : null,
    };
  });
  return { hasData: true, rows, emptyNotice: null };
}

export type ConfidenceLevel = "yuksek" | "orta" | "dusuk";

export interface ExecutiveItem {
  id: string;
  kind: "opportunity" | "risk" | "action";
  title: string;
  detail: string;
  evidence: string;
  impactCalculable: boolean;
  estimatedImpact: string;
  confidence: ConfidenceLevel;
  confidenceReason: string;
}

export interface ExecutiveSummary {
  opportunities: ExecutiveItem[];
  risks: ExecutiveItem[];
  actions: ExecutiveItem[];
}

export function buildExecutiveSummary(params: {
  summary: SalesSummary;
  breakdown: ProfitBreakdown;
  products: ProductAnalysis;
  discounts: DiscountCouponAnalysis;
  advertising: AdvertisingAnalysis;
  funnel: FunnelAnalysis;
  listing: ListingChecklistItem[];
  reviewsAndReturns: ReviewsAndReturnsAnalysis;
}): ExecutiveSummary {
  const { summary, breakdown, products, discounts, advertising, funnel, listing, reviewsAndReturns } = params;
  const opportunities: ExecutiveItem[] = [];
  const risks: ExecutiveItem[] = [];
  const actions: ExecutiveItem[] = [];

  const tryFmt = (n: number) =>
    new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n);

  // --- OPPORTUNITIES (up to 3) ---
  const leader = products.topSellers[0];
  if (leader && summary.net.amount > 0) {
    const share = (leader.netSales / summary.net.amount) * 100;
    opportunities.push({
      id: "opp-top-seller",
      kind: "opportunity",
      title: `En güçlü satış motoru: ${leader.name}`,
      detail: "Seçili dönemde net satışın en büyük bölümünü taşıyan bu üründe stok sürekliliği ve varyant netliği öncelikli korunmalı.",
      evidence: `${leader.netUnits} net adet, ${tryFmt(leader.netSales)} net satış (toplam net satışın %${share.toFixed(1)}'i).`,
      impactCalculable: false,
      estimatedImpact: "Hesaplanamadı — satış artışı tahmini için görüntülenme/dönüşüm verisi gerekiyor.",
      confidence: "yuksek",
      confidenceReason: "Doğrudan Trendyol sipariş kayıtlarına dayanır.",
    });
  }

  if (products.unsoldProducts.length > 0) {
    const withStock = products.unsoldProducts.filter((p) => p.variants.some((v) => (v.stock ?? 0) > 0));
    opportunities.push({
      id: "opp-unsold-catalog",
      kind: "opportunity",
      title: `Satışa dönüşmeyen ${products.unsoldProducts.length} katalog ürünü`,
      detail: "Katalogda bulunan ancak seçili dönemde hiç satmayan ürünlerin fiyat, başlık ve görünürlük durumunu inceleyin.",
      evidence: `${products.unsoldProducts.length} ürün bu aralıkta 0 satış üretti (${withStock.length} tanesinde stok mevcut).`,
      impactCalculable: false,
      estimatedImpact: "Hesaplanamadı — trafik/görüntülenme verisi olmadan ek satış tahmini yapılmaz.",
      confidence: "orta",
      confidenceReason: "Katalog ve sipariş kayıtları mevcut, trafik verisi henüz eksik.",
    });
  }

  if (funnel.hasFunnelData && funnel.opportunities.length > 0) {
    const topFunnel = funnel.opportunities[0]!;
    opportunities.push({
      id: "opp-funnel",
      kind: "opportunity",
      title: `Huni dönüşüm fırsatı: ${topFunnel.productName}`,
      detail: topFunnel.reason,
      evidence: `${topFunnel.views} görüntülenme, ${topFunnel.addToCart} sepete ekleme, ${topFunnel.orders} sipariş.`,
      impactCalculable: false,
      estimatedImpact: "Hesaplanamadı — dönüşüm artış oranı test edilmeden TL artışı uydurulmaz.",
      confidence: "orta",
      confidenceReason: "Huni metriklerine dayanır.",
    });
  } else if (products.variantComparisons.length > 0) {
    const multi = products.variantComparisons[0]!;
    const bestVariant = multi.variants[0];
    if (bestVariant && bestVariant.grossUnits > 0) {
      opportunities.push({
        id: "opp-variant-focus",
        kind: "opportunity",
        title: `Varyant yoğunlaşması: ${multi.name}`,
        detail: `Aynı üründe talep belirli ölçülerde yoğunlaşıyor (${bestVariant.variantName}). Öne çıkan varyantlarda fiyat/stok takibini sıkılaştırın.`,
        evidence: `${multi.variants.length} varyant arasında '${bestVariant.variantName}' (${bestVariant.barcode}) ${bestVariant.netUnits} net adet ve ${tryFmt(bestVariant.netSales)} net satış üretti.`,
        impactCalculable: false,
        estimatedImpact: "Hesaplanamadı — ileri dönem talep tahmini için yeterli tarihsel/trafik verisi yok.",
        confidence: "yuksek",
        confidenceReason: "Sipariş barkodları ile katalog varyantlarının eşleşmesine dayanır.",
      });
    }
  }

  // --- RISKS (up to 3) ---
  if (breakdown.missingCostRecords > 0) {
    risks.push({
      id: "risk-missing-costs",
      kind: "risk",
      title: `${breakdown.missingCostRecords} satış kaydında ürün maliyeti eksik`,
      detail: "Birim maliyeti girilmeyen ürünler için ürün kârı hesaplanamıyor ve mağaza toplam net kârı olduğundan yüksek görünebilir.",
      evidence: `${products.missingCostProducts.length} üründe (${breakdown.missingCostRecords} satış satırı) birim maliyet boş.`,
      impactCalculable: false,
      estimatedImpact: "Hesaplanamadı — gerçek birim maliyet girilmeden maliyet etkisi hesaplanamaz.",
      confidence: "yuksek",
      confidenceReason: "Doğrudan ürün maliyet kayıtlarından doğrulandı.",
    });
  }

  const totalIssueAmount = round2(reviewsAndReturns.returns.amount + reviewsAndReturns.cancellations.amount);
  const totalIssueRate =
    summary.gross.units > 0
      ? (reviewsAndReturns.returns.units + reviewsAndReturns.cancellations.units) / summary.gross.units
      : 0;
  if (reviewsAndReturns.returns.units + reviewsAndReturns.cancellations.units > 0) {
    risks.push({
      id: "risk-returns-cancellations",
      kind: "risk",
      title: `İade ve iptal kaybı: %${(totalIssueRate * 100).toFixed(1)}`,
      detail:
        reviewsAndReturns.topIssueProducts[0]
          ? `En yüksek kayıp '${reviewsAndReturns.topIssueProducts[0].productName}' ürününde görülüyor. Ölçü ve ürün beklentisi kontrol edilmeli.`
          : "İade ve iptaller brüt satıştan doğrudan düşülüyor.",
      evidence: `${reviewsAndReturns.returns.units} iade (${tryFmt(reviewsAndReturns.returns.amount)}) + ${reviewsAndReturns.cancellations.units} iptal (${tryFmt(reviewsAndReturns.cancellations.amount)}).`,
      impactCalculable: true,
      estimatedImpact: `Gerçekleşen brüt tutar kaybı: ${tryFmt(totalIssueAmount)} (önlenebilir payı tahmin edilmez).`,
      confidence: "yuksek",
      confidenceReason: "Onaylı iade ve iptal kayıtlarına dayanır.",
    });
  }

  if (discounts.discountRateOfGross != null && discounts.discountRateOfGross >= 0.08) {
    risks.push({
      id: "risk-discount-erosion",
      kind: "risk",
      title: `İndirim/kupon oranı brüt satışın %${(discounts.discountRateOfGross * 100).toFixed(1)}'i`,
      detail: "Yüksek indirim oranı net satışı ve kâr marjını doğrudan daraltır; komisyon ve ürün maliyeti sonrası net katkı kontrol edilmeli.",
      evidence: `Net indirim ${tryFmt(discounts.netDiscounts)} (${discounts.discountedSaleLines}/${discounts.totalSaleLines} satış satırında indirim/kupon uygulandı).`,
      impactCalculable: true,
      estimatedImpact: `Gerçekleşen net satış düşüşü: ${tryFmt(discounts.netDiscounts)}.`,
      confidence: "yuksek",
      confidenceReason: "Sipariş indirim ve kupon satırlarından hesaplandı.",
    });
  } else if (listing.some((l) => l.severity === "yuksek")) {
    const highCount = listing.filter((l) => l.severity === "yuksek").length;
    risks.push({
      id: "risk-listing-conflicts",
      kind: "risk",
      title: `${highCount} yüksek öncelikli listeleme/varyant tutarsızlığı`,
      detail: "Yinelenen ölçü barkodları veya başlık-varyant çelişkileri yanlış sipariş ve iade riskini artırır.",
      evidence: listing
        .filter((l) => l.severity === "yuksek")
        .slice(0, 2)
        .map((l) => `${l.productName}: ${l.title}`)
        .join(" | "),
      impactCalculable: false,
      estimatedImpact: "Hesaplanamadı — düzeltme sonrası iade azalışı için geçmiş karşılaştırma yok.",
      confidence: "orta",
      confidenceReason: "Katalog başlık/varyant yapısından doğrudan tespit edildi.",
    });
  } else if (!advertising.hasPlatformAdData || !funnel.hasFunnelData) {
    risks.push({
      id: "risk-missing-channels",
      kind: "risk",
      title: "Eksik veri kanalları (huni, reklam geliri, yorumlar)",
      detail: "Görüntülenme, sepete ekleme, reklam ROAS ve müşteri yorumları henüz Trendyol'dan alınmadığı için büyüme fırsatlarının bir kısmı görünmüyor.",
      evidence: "Sipariş ve katalog verileri bağlı; huni, platform reklam performansı ve yorum kayıtları boş.",
      impactCalculable: false,
      estimatedImpact: "Hesaplanamadı — ilgili veri kaynakları bağlandığında ölçülebilir.",
      confidence: "yuksek",
      confidenceReason: "Uygulama veri tablosu durumuna dayanır.",
    });
  }

  // --- ACTIONS (up to 3) ---
  if (products.missingCostProducts.length > 0) {
    actions.push({
      id: "act-enter-missing-costs",
      kind: "action",
      title: "Maliyeti eksik ürünlerin birim maliyetlerini girin",
      detail: `Ürünler ekranından ${products.missingCostProducts.slice(0, 3).map((p) => p.name).join(", ")} ${products.missingCostProducts.length > 3 ? `ve ${products.missingCostProducts.length - 3} ürün daha` : ""} için birim maliyet tanımlayın.`,
      evidence: `${products.missingCostProducts.length} üründe (${breakdown.missingCostRecords} satış satırı) maliyet eksik olduğu için gerçek kâr ve başabaş ROAS hesaplanamıyor.`,
      impactCalculable: false,
      estimatedImpact: "Hesaplanamadı — doğrudan veri doğruluğu ve gerçek kâr görünürlüğü sağlar.",
      confidence: "yuksek",
      confidenceReason: "Eksik maliyet kayıtları birebir tespit edildi.",
    });
  }

  const topHighListing = listing.find((l) => l.severity === "yuksek");
  if (topHighListing) {
    actions.push({
      id: `act-listing-${topHighListing.id}`,
      kind: "action",
      title: `Trendyol panelinde varyant/başlık netliğini düzeltin (${topHighListing.productName})`,
      detail: topHighListing.detail,
      evidence: `${topHighListing.signal} (${topHighListing.dataSource}).`,
      impactCalculable: false,
      estimatedImpact: "Hesaplanamadı — düzeltme öncesi/sonrası karşılaştırma verisi henüz yok.",
      confidence: "orta",
      confidenceReason: "Katalog ve iade sinyaline dayalı, otomatik değişiklik yapılmaz.",
    });
  }

  if (reviewsAndReturns.topIssueProducts.length > 0) {
    const worst = reviewsAndReturns.topIssueProducts[0]!;
    actions.push({
      id: `act-review-returns-${worst.productName.slice(0, 24)}`,
      kind: "action",
      title: `En yüksek iade/iptalli ürünü inceleyin: ${worst.productName}`,
      detail: "Trendyol satıcı panelinden bu ürünün iade gerekçelerini, ölçü açıklamasını ve kargo/paketleme sürecini kontrol edin.",
      evidence: `${worst.grossUnits} brüt adette ${worst.returnedUnits} iade + ${worst.cancelledUnits} iptal (%${(worst.issueRate * 100).toFixed(1)} sorun oranı).`,
      impactCalculable: false,
      estimatedImpact: "Hesaplanamadı — iade sebep metinleri alınmadan önlenebilir oran tahmin edilmez.",
      confidence: "yuksek",
      confidenceReason: "Seçili tarih aralığındaki gerçek sipariş/iade kayıtlarına dayanır.",
    });
  }

  if (actions.length < 3 && breakdown.counts.expenses === 0 && summary.gross.units > 0) {
    actions.push({
      id: "act-add-expenses",
      kind: "action",
      title: "Döneme ait kargo, reklam ve operasyon giderlerini ekleyin",
      detail: "Seçili aralıkta Giderler ekranında kayıt bulunmuyor; gerçek net kârı görmek için reklam, paketleme ve kargo giderlerini girin.",
      evidence: `${summary.gross.units} brüt satış adedine karşılık 0 gider kaydı mevcut.`,
      impactCalculable: false,
      estimatedImpact: "Hesaplanamadı — gerçek net kâr doğruluğunu artırır.",
      confidence: "yuksek",
      confidenceReason: "Gider tablosu kayıt sayısına dayanır.",
    });
  }

  return {
    opportunities: opportunities.slice(0, 3),
    risks: risks.slice(0, 3),
    actions: actions.slice(0, 3),
  };
}

export interface AiAnalyticsReport {
  filters: Filters;
  summary: SalesSummary;
  breakdown: ProfitBreakdown;
  dailyTrend: DailyTrendPoint[];
  products: ProductAnalysis;
  discounts: DiscountCouponAnalysis;
  funnel: FunnelAnalysis;
  advertising: AdvertisingAnalysis;
  listing: ListingChecklistItem[];
  reviewsAndReturns: ReviewsAndReturnsAnalysis;
  competitors: CompetitorAnalysis;
  executive: ExecutiveSummary;
  recordCount: number;
  expenseCount: number;
}

export function computeAiReport(params: {
  orders: OrderRecord[];
  expenses: Expense[];
  products: Product[];
  adRows: AdDailyPerformance[];
  funnelRows: FunnelMetricRow[];
  reviews: CustomerReviewRow[];
  competitors: CompetitorEntry[];
  filters: Filters;
  targetNetMarginPct: number;
}): AiAnalyticsReport {
  const { records, expenses } = filterWorkspaceForAi(params.orders, params.expenses, params.filters);
  const summary = calculateSalesSummary(records);
  const breakdown = calculateProfit(records, expenses, params.products);
  const dailyTrend = analyzeDailyTrend(records, expenses, params.products);
  const products = analyzeProductsAndVariants(records, params.products, params.filters.storeId);
  const discounts = analyzeDiscountsAndCoupons(records, summary);
  const funnel = analyzeFunnel(records, params.funnelRows, params.products, params.filters);
  const advertising = analyzeAdvertising(params.adRows, breakdown, params.filters, params.targetNetMarginPct);
  const listing = analyzeListingChecklist(params.products, products, params.filters.storeId);
  const reviewsAndReturns = analyzeReviewsAndReturns(records, summary, products, params.reviews, params.filters);
  const competitors = analyzeCompetitors(params.competitors, params.products, params.filters.storeId);
  const executive = buildExecutiveSummary({
    summary,
    breakdown,
    products,
    discounts,
    advertising,
    funnel,
    listing,
    reviewsAndReturns,
  });

  return {
    filters: params.filters,
    summary,
    breakdown,
    dailyTrend,
    products,
    discounts,
    funnel,
    advertising,
    listing,
    reviewsAndReturns,
    competitors,
    executive,
    recordCount: records.length,
    expenseCount: expenses.length,
  };
}