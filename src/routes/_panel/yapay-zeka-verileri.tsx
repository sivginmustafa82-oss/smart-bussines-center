import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/ui-bits";
import { AiDateStoreBar } from "@/components/app/ai/AiDateStoreBar";
import { AiExecutivePanel } from "@/components/app/ai/AiExecutivePanel";
import { AiGrowthChannelsSection } from "@/components/app/ai/AiGrowthChannelsSection";
import { AiListingCompetitorSection } from "@/components/app/ai/AiListingCompetitorSection";
import { AiProductsSection } from "@/components/app/ai/AiProductsSection";
import { AiSalesProfitSection } from "@/components/app/ai/AiSalesProfitSection";
import {
  actionStorageKey,
  addCompetitorEntry,
  deleteCompetitorEntry,
  deleteSavedAiReport,
  fetchCloudAdPerformance,
  saveAiReportSnapshot,
  setTargetNetMarginPct,
  toggleAiActionCompletion,
  useAiWorkspace,
} from "@/lib/data/ai-workspace";
import { useWorkspace } from "@/lib/data/hooks";
import { defaultAiDateRange, validateAiDateRange } from "@/lib/domain/ai-analytics";
import { exportAiReportToExcel, exportAiReportToJson } from "@/lib/domain/ai-export";
import { computeAiReport } from "@/lib/domain/ai-insights";
import type { AdDailyPerformance } from "@/lib/domain/types";

export const Route = createFileRoute("/_panel/yapay-zeka-verileri")({
  head: () => ({
    meta: [
      { title: "Yapay Zekâ Verileri — Smart Bussines Center" },
      {
        name: "description",
        content:
          "Mevcut Trendyol ve mağaza verilerinden türetilen gerçek, izlenebilir kârlılık, ürün/varyant, reklam, huni ve yönetici aksiyon analizleri.",
      },
      { property: "og:title", content: "Yapay Zekâ Verileri — Smart Bussines Center" },
      {
        property: "og:description",
        content: "Gerçek veriye dayalı, izlenebilir mağaza analizleri ve aksiyon listesi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiDataPage,
});

function AiDataPage() {
  const ws = useWorkspace();
  const aiState = useAiWorkspace(ws.tenantId);
  const initialRange = useMemo(() => defaultAiDateRange(), []);
  const [storeId, setStoreId] = useState<string | "all">("all");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [adRows, setAdRows] = useState<AdDailyPerformance[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchCloudAdPerformance()
      .then((rows) => {
        if (!cancelled) setAdRows(rows);
      })
      .catch(() => {
        if (!cancelled) setAdRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ws.tenantId]);

  const rangeCheck = useMemo(() => validateAiDateRange(from, to), [from, to]);
  const validStoreId = storeId === "all" || ws.stores.some((s) => s.id === storeId) ? storeId : "all";
  const storeName = ws.stores.find((s) => s.id === validStoreId)?.name ?? "Tüm mağazalar";

  const report = useMemo(() => {
    const effectiveFilters = rangeCheck.valid
      ? { storeId: validStoreId, from, to }
      : { storeId: validStoreId, from: null, to: null };
    return computeAiReport({
      orders: rangeCheck.valid ? ws.orders : [],
      expenses: rangeCheck.valid ? ws.expenses : [],
      products: ws.products,
      adRows: rangeCheck.valid ? adRows : [],
      funnelRows: [],
      reviews: [],
      competitors: aiState.competitors,
      filters: effectiveFilters,
      targetNetMarginPct: aiState.targetNetMarginPct,
    });
  }, [ws.orders, ws.expenses, ws.products, adRows, aiState.competitors, aiState.targetNetMarginPct, validStoreId, from, to, rangeCheck.valid]);

  const exportActions = useMemo(
    () =>
      report.executive.actions.map((a) => {
        const rec = aiState.completions[actionStorageKey(a.id, validStoreId, from, to)];
        return {
          id: a.id,
          title: a.title,
          detail: a.detail,
          evidence: a.evidence,
          estimatedImpact: a.estimatedImpact,
          confidence: a.confidence,
          completed: rec?.completed ?? false,
          ...(rec?.completedAt ? { completedAt: rec.completedAt } : {}),
        };
      }),
    [report.executive.actions, aiState.completions, validStoreId, from, to],
  );

  function handleSaveReport() {
    if (!rangeCheck.valid) return;
    saveAiReportSnapshot(ws.tenantId, {
      storeId: validStoreId,
      storeName,
      from,
      to,
      metrics: {
        grossSales: report.summary.gross.amount,
        netSales: report.summary.net.amount,
        netUnits: report.summary.net.units,
        netProfit: report.breakdown.netProfit,
        margin: report.breakdown.margin,
        missingCostRecords: report.breakdown.missingCostRecords,
        returnsUnits: report.summary.returns.units,
        cancellationsUnits: report.summary.cancellations.units,
      },
      opportunities: report.executive.opportunities,
      risks: report.executive.risks,
      actions: report.executive.actions.map((a) => ({
        ...a,
        completed: aiState.completions[actionStorageKey(a.id, validStoreId, from, to)]?.completed ?? false,
      })),
    });
    toast.success("Dönem raporu geçmiş raporlara kaydedildi.");
  }

  return (
    <>
      <PageHeader
        eyebrow="Yapay Zekâ Verileri · İzlenebilir Analiz"
        title="Yapay Zekâ Verileri"
        description="Yalnızca mevcut mağaza ve Trendyol verilerinizden üretilen şeffaf analizler, boş veri bildirimleri ve takip edilebilir aksiyon listesi."
      />

      <AiDateStoreBar
        stores={ws.stores}
        storeId={validStoreId}
        onStoreChange={setStoreId}
        from={from}
        to={to}
        onRangeChange={(nextFrom, nextTo) => {
          setFrom(nextFrom);
          setTo(nextTo);
        }}
        dateError={rangeCheck.error}
        onSaveReport={handleSaveReport}
        onExportExcel={() => {
          exportAiReportToExcel({ report, storeName, from, to, actions: exportActions });
          toast.success("Excel raporu indirildi.");
        }}
        onExportJson={() => {
          exportAiReportToJson({ report, storeName, from, to, actions: exportActions });
          toast.success("JSON raporu indirildi.");
        }}
        exportDisabled={!rangeCheck.valid}
      />

      <Tabs defaultValue="ozet" className="space-y-5">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-paper p-1">
          <TabsTrigger value="ozet">Yönetici Özeti & Aksiyonlar</TabsTrigger>
          <TabsTrigger value="satis">Satış, Kârlılık & İndirim</TabsTrigger>
          <TabsTrigger value="urunler">Ürün & Varyantlar</TabsTrigger>
          <TabsTrigger value="kanallar">Huni, Reklam & Yorumlar</TabsTrigger>
          <TabsTrigger value="listeleme">Listeleme & Rakip</TabsTrigger>
        </TabsList>

        <TabsContent value="ozet">
          <AiExecutivePanel
            executive={report.executive}
            storeId={validStoreId}
            from={from}
            to={to}
            completions={aiState.completions}
            onToggleAction={(item) =>
              toggleAiActionCompletion(ws.tenantId, {
                actionId: item.id,
                title: item.title,
                storeId: validStoreId,
                from,
                to,
              })
            }
            savedReports={aiState.savedReports}
            onDeleteReport={(id) => {
              deleteSavedAiReport(ws.tenantId, id);
              toast.success("Kayıtlı rapor silindi.");
            }}
            onSelectReportRange={(sId, rFrom, rTo) => {
              setStoreId(sId);
              setFrom(rFrom);
              setTo(rTo);
            }}
          />
        </TabsContent>

        <TabsContent value="satis">
          <AiSalesProfitSection
            summary={report.summary}
            breakdown={report.breakdown}
            dailyTrend={report.dailyTrend}
            discounts={report.discounts}
          />
        </TabsContent>

        <TabsContent value="urunler">
          <AiProductsSection products={report.products} />
        </TabsContent>

        <TabsContent value="kanallar">
          <AiGrowthChannelsSection
            funnel={report.funnel}
            advertising={report.advertising}
            reviewsAndReturns={report.reviewsAndReturns}
            targetMarginPct={aiState.targetNetMarginPct}
            onTargetMarginChange={(pct) => setTargetNetMarginPct(ws.tenantId, pct)}
          />
        </TabsContent>

        <TabsContent value="listeleme">
          <AiListingCompetitorSection
            listing={report.listing}
            competitors={report.competitors}
            stores={ws.stores}
            products={ws.products}
            selectedStoreId={validStoreId}
            onAddCompetitor={(input) => addCompetitorEntry(ws.tenantId, input)}
            onDeleteCompetitor={(id) => {
              deleteCompetitorEntry(ws.tenantId, id);
              toast.success("Rakip kaydı silindi.");
            }}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}