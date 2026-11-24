import { createFileRoute } from "@tanstack/react-router";
import {
  BadgePercent,
  Ban,
  CheckCircle2,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
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

const money = (value: number) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
}).format(value);

function StoreSummary() {
  const { ws, records, filters } = useFilteredProfit();
  const summary = calculateSalesSummary(records);
  const storeName = ws.stores.find((store) => store.id === filters.storeId)?.name ?? "Tüm mağazalar";
  const period = filters.from || filters.to
    ? `${filters.from ?? "Başlangıç"} – ${filters.to ?? "Bugün"}`
    : "Tüm zamanlar";
  const retention = summary.gross.amount > 0
    ? Math.max(0, Math.min(100, (summary.net.amount / summary.gross.amount) * 100))
    : 0;

  const cards = [
    {
      title: "Brüt satış",
      units: summary.gross.units,
      amount: summary.gross.amount,
      detail: "Satışa dönüşen toplam tutar",
      icon: ShoppingBag,
      iconTone: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
      amountTone: "text-foreground",
    },
    {
      title: "İptaller",
      units: summary.cancellations.units,
      amount: summary.cancellations.amount,
      detail: "İptal edilen sipariş tutarı",
      icon: Ban,
      iconTone: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
      amountTone: "text-rose-700 dark:text-rose-300",
    },
    {
      title: "İadeler",
      units: summary.returns.units,
      amount: summary.returns.amount,
      detail: "Onaylı iade tutarı",
      icon: RotateCcw,
      iconTone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
      amountTone: "text-amber-700 dark:text-amber-300",
    },
    {
      title: "İndirimler",
      units: null,
      amount: summary.discounts.amount,
      detail: "Net satıcı indirimi",
      icon: BadgePercent,
      iconTone: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
      amountTone: "text-violet-700 dark:text-violet-300",
    },
  ];

  const chartData = [
    { name: "Brüt satış", tutar: summary.gross.amount, color: "#0ea5e9" },
    { name: "İptaller", tutar: summary.cancellations.amount, color: "#f43f5e" },
    { name: "İadeler", tutar: summary.returns.amount, color: "#f59e0b" },
    { name: "İndirimler", tutar: summary.discounts.amount, color: "#8b5cf6" },
    { name: "Net satış", tutar: summary.net.amount, color: "#10b981" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Trendyol · Satış performansı"
        title="Mağaza Özeti"
        description="Satışlarınızı, kesintilerinizi ve Trendyol ile mutabık net satışınızı tek ekranda takip edin."
      />
      <FilterBar stores={ws.stores} />

      <section className="relative mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-white shadow-xl sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">
                <CheckCircle2 className="size-3.5" /> Satış özeti
              </span>
              <span className="text-xs text-slate-300">{storeName} · {period}</span>
            </div>
            <p className="text-sm font-medium text-slate-300">GERÇEKLEŞEN NET SATIŞ</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{money(summary.net.amount)}</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                <TrendingUp className="size-3.5" /> {formatNumber(summary.net.units)} adet
              </span>
            </div>
            <p className="mt-3 max-w-xl text-sm text-slate-300">
              Brüt satıştan iptal, iade ve net indirimler düşüldükten sonra kalan tutar.
            </p>
          </div>
          <div className="w-full rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm lg:max-w-xs">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-300">Brütten nete kalan</span>
              <span className="font-semibold tabular-nums text-white">%{retention.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all" style={{ width: `${retention}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>Brüt: {money(summary.gross.amount)}</span>
              <span>Net: {money(summary.net.amount)}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <article
              key={card.title}
              className="group rounded-2xl border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-5"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">{card.title}</p>
                  {card.units !== null && (
                    <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                      {formatNumber(card.units)} <span className="text-sm font-medium text-muted-foreground">adet</span>
                    </p>
                  )}
                </div>
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${card.iconTone}`}>
                  <Icon className="size-5" />
                </span>
              </div>
              <div className={`mt-4 text-xl font-bold tracking-tight tabular-nums ${card.amountTone}`}>
                <Money value={-card.amount} sign="minus" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
            </article>
          );
        })}
      </div>

      <div className="mb-5 grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Panel
          title="Satış dağılımı"
          description="Seçili dönemde brüt satış, kesintiler ve net satış karşılaştırması."
        >
          <div className="h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis
                  tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => money(Number(value))}
                  cursor={{ fill: "var(--color-muted)", opacity: 0.35 }}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                    boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                  }}
                />
                <Bar dataKey="tutar" name="Tutar" radius={[8, 8, 0, 0]} maxBarSize={54}>
                  {chartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="Net satışın hesabı"
          description="Trendyol raporundaki net satış hesabıyla aynı kalemler."
        >
          <div className="space-y-3">
            {[
              { label: "Brüt satış", value: summary.gross.amount, sign: "+", tone: "text-sky-700 dark:text-sky-300" },
              { label: "İptaller", value: summary.cancellations.amount, sign: "−", tone: "text-rose-700 dark:text-rose-300" },
              { label: "İadeler", value: summary.returns.amount, sign: "−", tone: "text-amber-700 dark:text-amber-300" },
              { label: "Net indirim", value: summary.discounts.amount, sign: "−", tone: "text-violet-700 dark:text-violet-300" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-3">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className={`text-sm font-semibold tabular-nums ${item.tone}`}>
                  {item.sign} {money(item.value)}
                </span>
              </div>
            ))}

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <Wallet className="size-4" /> Hesaplanan net satış
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300 tabular-nums">
                {money(summary.net.amount)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatNumber(summary.net.units)} adet</p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="İndirim mutabakatı"
        description="Satış indirimi ile iade edilen ürün indiriminin netleştirilmiş hali."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Satışlardaki satıcı indirimi</p>
            <p className="mt-2 text-xl font-bold tabular-nums">{money(summary.discounts.sales)}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">İade edilen ürün indirimi</p>
            <p className="mt-2 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">+ {money(summary.discounts.returned)}</p>
            <p className="mt-1 text-xs text-muted-foreground">İade nedeniyle indirime geri eklenir</p>
          </div>
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-4">
            <p className="text-xs font-medium text-muted-foreground">Trendyol indirim toplamı</p>
            <p className="mt-2 text-xl font-bold tabular-nums">{money(summary.discounts.amount)}</p>
          </div>
        </div>
      </Panel>

      <div className="mt-4 flex items-start gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <p>
          {records.length} kayıt üzerinden hesaplandı. Net indirim = satış indirimleri − onaylı iadeye ait ürün indirimi.
          İptal paketlerinin indirimleri Trendyol indirim toplamına dahil edilmez. Seçili tarih aralığındaki onaylı iadeler
          hesaba katılır.
        </p>
      </div>
    </>
  );
}
