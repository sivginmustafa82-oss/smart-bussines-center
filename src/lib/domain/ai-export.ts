import * as XLSX from "xlsx";
import type { AiAnalyticsReport } from "./ai-insights";

export interface ExportActionRecord {
  id: string;
  title: string;
  detail: string;
  evidence: string;
  estimatedImpact: string;
  confidence: string;
  completed: boolean;
  completedAt?: string | undefined;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  yuksek: "Yüksek",
  orta: "Orta",
  dusuk: "Düşük",
};

export function exportAiReportToExcel(params: {
  report: AiAnalyticsReport;
  storeName: string;
  from: string;
  to: string;
  actions: ExportActionRecord[];
}) {
  const { report, storeName, from, to, actions } = params;
  const wb = XLSX.utils.book_new();

  // Sheet 1: Satış & Kârlılık Özeti
  const summaryRows: (string | number)[][] = [
    ["Smart Bussines Center — Yapay Zekâ Verileri Raporu"],
    ["Mağaza", storeName],
    ["Tarih Aralığı (Europe/Istanbul, bitiş dahil)", `${from} – ${to}`],
    ["Oluşturulma (ISO)", new Date().toISOString()],
    ["Veri kapsamı", `${report.recordCount} sipariş/iade/iptal kaydı, ${report.expenseCount} gider kaydı`],
    [],
    ["Metrik", "Değer", "Açıklama / Kaynak"],
    ["Brüt satış (₺)", report.summary.gross.amount, `${report.summary.gross.units} brüt adet (sipariş kayıtları)`],
    ["İptaller (₺)", report.summary.cancellations.amount, `${report.summary.cancellations.units} iptal adedi`],
    ["İadeler (₺)", report.summary.returns.amount, `${report.summary.returns.units} onaylı iade adedi`],
    ["Net indirim & kupon (₺)", report.summary.discounts.amount, "Satıcı indirimi + kupon − iade indirim düzeltmesi"],
    ["Net satış (₺)", report.summary.net.amount, `${report.summary.net.units} net adet`],
    ["Komisyon (₺)", report.breakdown.commission, "Sipariş kayıtları"],
    ["Kargo (₺)", report.breakdown.shipping, "Sipariş + kargo giderleri"],
    ["Reklam gideri (₺)", report.breakdown.advertising, "Giderler (manuel) — platform reklam tablosu ayrıca izlenir"],
    ["Stopaj / vergi (₺)", report.breakdown.taxes, "Sipariş stopaj + vergi giderleri"],
    ["Ürün maliyeti (₺)", report.breakdown.productCost, report.breakdown.missingCostRecords > 0 ? `${report.breakdown.missingCostRecords} satış kaydında maliyet eksik` : "Tüm satışlar maliyetli"],
    ["Diğer giderler (₺)", report.breakdown.otherExpenses, "Gider kayıtları"],
    ["Net kâr (₺)", report.breakdown.netProfit, report.breakdown.missingCostRecords > 0 ? "Eksik maliyetler nedeniyle net kâr üst sınır niteliğindedir" : "Net satış − tüm kesinti ve giderler"],
    ["Kâr marjı (%)", report.breakdown.margin != null ? Math.round(report.breakdown.margin * 1000) / 10 : "Hesaplanamadı", "Net kâr / Net satış"],
    ["Platform ROAS", report.advertising.roas != null ? report.advertising.roas : "Veri yok", report.advertising.missingDataNotice ?? "ad_daily_performance"],
    ["Başabaş ROAS", report.advertising.breakEvenRoas != null ? report.advertising.breakEvenRoas : "Hesaplanamadı", report.advertising.guidanceNote],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Ozet");

  // Sheet 2: Ürün Performansı
  const productRows: (string | number)[][] = [
    ["Ürün", "SKU", "Barkod", "Birim Maliyet (₺)", "Brüt Adet", "İade Adet", "İptal Adet", "Net Adet", "Net Satış (₺)", "Ürün Katkı Kârı (₺)", "Kâr Durumu", "İade Oranı (%)"],
    ...report.products.all.map((p) => [
      p.name,
      p.sku,
      p.barcode,
      p.unitCost ?? "Eksik",
      p.grossUnits,
      p.returnedUnits,
      p.cancelledUnits,
      p.netUnits,
      p.netSales,
      p.netContribution ?? "Kâr hesaplanamadı",
      p.profitStatus === "calculated" ? "Hesaplandı" : p.profitStatus === "missing_cost" ? "Maliyet eksik" : "Satış yok",
      p.returnRate != null ? Math.round(p.returnRate * 1000) / 10 : "",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(productRows), "Urunler");

  // Sheet 3: Barkod / Varyant Karşılaştırması
  const variantRows: (string | number)[][] = [
    ["Ana Ürün", "Barkod", "Varyant / Ölçü", "Satış Fiyatı (₺)", "Stok", "Brüt Adet", "İade", "İptal", "Net Adet", "Net Satış (₺)", "Yinelenen Ad"],
    ...report.products.variantComparisons.flatMap((p) =>
      p.variants.map((v) => [
        p.name,
        v.barcode,
        v.variantName,
        v.salePrice ?? "",
        v.stock ?? "",
        v.grossUnits,
        v.returnedUnits,
        v.cancelledUnits,
        v.netUnits,
        v.netSales,
        v.duplicateName ? "Evet" : "Hayır",
      ]),
    ),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(variantRows), "Varyantlar");

  // Sheet 4: Yönetici Özeti & Aksiyonlar
  const execRows: (string | number)[][] = [
    ["Tür", "Başlık", "Detay", "Veri Dayanağı", "Tahmini Etki", "Güven", "Durum", "Tamamlanma"],
    ...report.executive.opportunities.map((o) => [
      "Fırsat",
      o.title,
      o.detail,
      o.evidence,
      o.estimatedImpact,
      CONFIDENCE_LABEL[o.confidence] ?? o.confidence,
      "",
      "",
    ]),
    ...report.executive.risks.map((r) => [
      "Risk",
      r.title,
      r.detail,
      r.evidence,
      r.estimatedImpact,
      CONFIDENCE_LABEL[r.confidence] ?? r.confidence,
      "",
      "",
    ]),
    ...actions.map((a) => [
      "Aksiyon",
      a.title,
      a.detail,
      a.evidence,
      a.estimatedImpact,
      CONFIDENCE_LABEL[a.confidence] ?? a.confidence,
      a.completed ? "Tamamlandı" : "Açık",
      a.completedAt ?? "",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(execRows), "Yonetici_Ozeti");

  XLSX.writeFile(wb, `smart-bussines-center-yapay-zeka-${from}-${to}.xlsx`);
}

export function exportAiReportToJson(params: {
  report: AiAnalyticsReport;
  storeName: string;
  from: string;
  to: string;
  actions: ExportActionRecord[];
}) {
  const payload = {
    app: "Smart Bussines Center",
    reportType: "yapay-zeka-verileri",
    timezone: "Europe/Istanbul",
    generatedAt: new Date().toISOString(),
    storeName: params.storeName,
    range: { from: params.from, to: params.to },
    report: params.report,
    actions: params.actions,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `smart-bussines-center-yapay-zeka-${params.from}-${params.to}.json`;
  a.click();
  URL.revokeObjectURL(url);
}