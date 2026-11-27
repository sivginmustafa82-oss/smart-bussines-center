import { Link } from "@tanstack/react-router";
import { AlertTriangle, BadgePercent, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Money, Panel } from "@/components/app/ui-bits";
import type { DailyTrendPoint, DiscountCouponAnalysis } from "@/lib/domain/ai-analytics";
import type { ProfitBreakdown } from "@/lib/domain/profitability";
import type { SalesSummary } from "@/lib/domain/sales-summary";
import { formatDate, formatNumber, formatPercent, formatTRY } from "@/lib/format";

export function AiSalesProfitSection({
  summary,
  breakdown,
  dailyTrend,
  discounts,
}: {
  summary: SalesSummary;
  breakdown: ProfitBreakdown;
  dailyTrend: DailyTrendPoint[];
  discounts: DiscountCouponAnalysis;
}) {
  const kpis = [
    {
      label: "Brüt satış",
      value: summary.gross.amount,
      sub: `${formatNumber(summary.gross.units)} brüt adet`,
      source: "Sipariş kayıtları",
    },
    {
      label: "Net satış",
      value: summary.net.amount,
      sub: `${formatNumber(summary.net.units)} net adet · İptal/iade/indirim sonrası`,
      source: "Brüt − iptal − iade − net indirim",
    },
    {
      label: "İptal + İade",
      value: summary.cancellations.amount + summary.returns.amount,
      sub: `${formatNumber(summary.cancellations.units)} iptal · ${formatNumber(summary.returns.units)} onaylı iade`,
      source: "Orijinal sipariş tarihine göre",
      sign: "minus" as const,
    },
    {
      label: "Net kâr",
      value: breakdown.netProfit,
      sub:
        breakdown.missingCostRecords > 0
          ? `Marj: ${formatPercent(breakdown.margin)} · ${breakdown.missingCostRecords} satırda maliyet eksik`
          : `Kâr marjı: ${formatPercent(breakdown.margin)}`,
      source: "Net satış − tüm kesinti ve giderler",
    },
  ];

  const costLines = [
    { label: "İndirim & kupon (net)", value: breakdown.discounts, note: "Satıcı indirimi + kupon − iade düzeltmesi" },
    { label: "Pazaryeri komisyonu", value: breakdown.commission, note: "Sipariş kayıtlarından" },
    { label: "Kargo", value: breakdown.shipping, note: "Sipariş + kargo giderleri" },
    { label: "Reklam gideri (manuel)", value: breakdown.advertising, note: "Giderler (reklam kategorisi)" },
    { label: "Stopaj / vergi", value: breakdown.taxes, note: "Sipariş stopaj + vergi giderleri" },
    {
      label: "Ürün maliyeti",
      value: breakdown.productCost,
      note:
        breakdown.missingCostRecords > 0
          ? `${breakdown.missingCostRecords} satış kaydında maliyet eksik (0 sayıldı)`
          : "Birim maliyet × net adet",
    },
    { label: "Diğer giderler", value: breakdown.otherExpenses, note: "Paketleme, personel, yazılım, kira, diğer" },
  ];

  return (
    <div className="space-y-6">
      {breakdown.missingCostRecords > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Seçili tarih aralığında <strong>{breakdown.missingCostRecords} satış kaydının</strong> ürün birim maliyeti
            eksik. Mağaza toplam net kârı bu kayıtlar için maliyet 0 kabul edilerek hesaplanır; ürün bazında kâr tablosunda
            maliyetsiz ürünler için “Kâr hesaplanamadı” gösterilir.{" "}
            <Link to="/urunler" className="font-semibold underline">
              Ürün maliyetlerini tamamlayın
            </Link>
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <article key={k.label} className="rounded-xl border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{k.label}</span>
              <Badge variant="outline" className="text-[10px] font-normal">
                {k.source}
              </Badge>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight">
              <Money value={k.value} sign={k.sign} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{k.sub}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Panel
          title={
            <span className="flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" /> Günlük Satış ve Net Kâr Seyri (TR)
            </span>
          }
          description="Europe/Istanbul yerel günlerine göre net satış ve net kâr dağılımı."
        >
          {dailyTrend.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Seçili tarih aralığında grafik oluşturacak sipariş veya gider kaydı bulunmuyor.
            </p>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => formatDate(String(v)).slice(0, 6)}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={46}
                  />
                  <Tooltip
                    labelFormatter={(v) => formatDate(String(v))}
                    formatter={(value, name) => [
                      formatTRY(Number(value)),
                      name === "netSales" ? "Net satış" : "Net kâr",
                    ]}
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="netSales"
                    stroke="var(--color-chart-1)"
                    fill="var(--color-chart-1)"
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="netProfit"
                    stroke="var(--color-chart-2)"
                    fill="var(--color-chart-2)"
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Kesinti, Maliyet ve Gider Dağılımı"
          description={`Kaynak: ${breakdown.sources.imported} içe aktarılan · ${breakdown.sources.manual} manuel kayıt`}
        >
          <div className="divide-y rounded-lg border">
            {costLines.map((line) => (
              <div key={line.label} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{line.label}</div>
                  <div className="text-[11px] text-muted-foreground">{line.note}</div>
                </div>
                <Money value={line.value} sign={line.value > 0 ? "minus" : undefined} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <BadgePercent className="size-4 text-primary" /> Kampanya, İndirim ve Kupon Etkisi
          </span>
        }
        description={discounts.impactSummary}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">Satıcı indirimi (brüt)</div>
            <div className="mt-1 text-lg font-semibold">
              <Money value={discounts.sellerDiscountGross} />
            </div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">Kupon indirimi (brüt)</div>
            <div className="mt-1 text-lg font-semibold">
              <Money value={discounts.couponDiscountGross} />
            </div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">İade ile geri dönen indirim</div>
            <div className="mt-1 text-lg font-semibold text-success">
              + <Money value={discounts.returnedDiscountReversal} />
            </div>
          </div>
          <div className="rounded-lg border bg-secondary/50 p-3.5">
            <div className="text-xs text-muted-foreground">Net indirim / Brüt oranı</div>
            <div className="mt-1 text-lg font-semibold">
              <Money value={discounts.netDiscounts} />{" "}
              <span className="num text-xs font-normal text-muted-foreground">
                ({formatPercent(discounts.discountRateOfGross)})
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {discounts.discountedSaleLines}/{discounts.totalSaleLines} satış satırında indirim/kupon (
              {formatPercent(discounts.discountedOrderShare)})
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}