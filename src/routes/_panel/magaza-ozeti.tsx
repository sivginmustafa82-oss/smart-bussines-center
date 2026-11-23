import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FilterBar } from "@/components/app/filters";
import { useFilteredProfit } from "@/components/app/useProfit";
import { PageHeader, Panel, Money } from "@/components/app/ui-bits";
import { calculateSalesSummary } from "@/lib/domain/sales-summary";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_panel/magaza-ozeti")({
  head: () => ({
    meta: [
      { title: "Mağaza Özeti — Smart Bussines Center" },
      { name: "description", content: "Trendyol satış, iptal, iade, indirim ve net satış özeti." },
    ],
  }),
  component: StoreSummary,
});

const COLORS = ["#2563eb", "#f59e0b", "#ef4444", "#8b5cf6", "#059669"];
const money = (value: number) => new Intl.NumberFormat("tr-TR", {
  style: "currency", currency: "TRY", maximumFractionDigits: 0,
}).format(value);

function StoreSummary() {
  const { ws, records, filters } = useFilteredProfit();
  const summary = calculateSalesSummary(records);
  const cards = [
    { title: "Brüt satış", units: summary.gross.units, amount: summary.gross.amount, tone: "border-blue-200 bg-blue-50/60 dark:bg-blue-950/20" },
    { title: "İptaller", units: -summary.cancellations.units, amount: -summary.cancellations.amount, tone: "border-rose-200 bg-rose-50/60 dark:bg-rose-950/20" },
    { title: "İadeler", units: -summary.returns.units, amount: -summary.returns.amount, tone: "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20" },
    { title: "İndirimler", units: null, amount: -summary.discounts.amount, tone: "border-violet-200 bg-violet-50/60 dark:bg-violet-950/20" },
    { title: "Net satış", units: summary.net.units, amount: summary.net.amount, tone: "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20" },
  ];
  const period = filters.from || filters.to
    ? `${filters.from ?? "Başlangıç"} – ${filters.to ?? "Bugün"}`
    : "Tüm zamanlar";
  const chartData = [
    { name: "Brüt satış", tutar: summary.gross.amount },
    { name: "İptaller", tutar: summary.cancellations.amount },
    { name: "İadeler", tutar: summary.returns.amount },
    { name: "İndirimler", tutar: summary.discounts.amount },
    { name: "Net satış", tutar: summary.net.amount },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Trendyol satış performansı"
        title="Mağaza Özeti"
        description={`${ws.stores.find((s) => s.id === filters.storeId)?.name ?? "Tüm mağazalar"} · ${period}`}
      />
      <FilterBar stores={ws.stores} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.title} className={`rounded-2xl border p-4 shadow-sm ${card.tone}`}>
            <div className="text-sm font-medium text-muted-foreground">{card.title}</div>
            {card.units !== null && (
              <div className="mt-2 text-2xl font-bold tabular-nums">
                {formatNumber(card.units)} <span className="text-sm font-medium text-muted-foreground">adet</span>
              </div>
            )}
            <div className={`mt-2 text-lg font-semibold tabular-nums ${card.title === "Net satış" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
              <Money value={card.amount} />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Satış ve kesintiler" description="Brüt satıştan iptal, iade ve net indirimler çıkarılarak net satış hesaplanır.">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Bar dataKey="tutar" radius={[7, 7, 0, 0]}>
                  {chartData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Hesap kontrolü" description="Bu alan, ekrandaki net satışın hangi kalemlerden oluştuğunu gösterir.">
          <div className="space-y-4">
            {[
              ["Brüt satış", summary.gross.amount, "+"],
              ["İptaller", summary.cancellations.amount, "−"],
              ["İadeler", summary.returns.amount, "−"],
              ["Net indirim", summary.discounts.amount, "−"],
            ].map(([label, value, sign]) => (
              <div key={String(label)} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-nums">{sign} {money(Number(value))}</span>
              </div>
            ))}
            <div className="rounded-xl bg-muted/40 p-3">
              <div className="mb-2 text-sm font-semibold">İndirim mutabakatı</div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Satışlardaki satıcı indirimi</span>
                <span className="font-medium tabular-nums">{money(summary.discounts.sales)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">İade edilen ürün indirimi (geri eklenir)</span>
                <span className="font-medium tabular-nums">+ {money(summary.discounts.returned)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2 text-sm">
                <span className="font-semibold">Trendyol indirim toplamı</span>
                <span className="font-semibold tabular-nums">{money(summary.discounts.amount)}</span>
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="text-sm text-muted-foreground">Hesaplanan net satış</div>
              <div className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{money(summary.net.amount)}</div>
              <div className="mt-1 text-sm text-muted-foreground">{formatNumber(summary.net.units)} adet</div>
            </div>
          </div>
        </Panel>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {records.length} kayıt üzerinden hesaplandı. Net indirim = satış indirimleri − onaylı iadeye ait ürün indirimi. İptal paketlerinin indirimleri Trendyol indirim toplamına dahil edilmez.
        Trendyol ile birebir mutabakat için seçili tarih aralığındaki onaylı iadelerin de aktarılmış olması gerekir.
      </p>
    </>
  );
}
