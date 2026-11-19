import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Check, Circle, LayoutDashboard, PlugZap, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/app/filters";
import { useFilteredProfit } from "@/components/app/useProfit";
import { EmptyState, Money, PageHeader, Panel, SourceBadge } from "@/components/app/ui-bits";
import { calculateProfit, filterExpenses } from "@/lib/domain/profitability";
import { RECORD_TYPE_LABELS } from "@/lib/domain/labels";
import { formatDate, formatPercent, formatPeriod, formatTRY } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/genel-bakis")({
  head: () => ({
    meta: [
      { title: "Genel Bakış — Smart Bussines Center" },
      { name: "description", content: "Girdiğiniz verilere göre satış, net satış ve net kâr özeti." },
      { property: "og:title", content: "Genel Bakış — Smart Bussines Center" },
      { property: "og:description", content: "Pazaryeri işletmenizin kârlılık özeti." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { ws, records, expenses, breakdown: b, hasData, filters } = useFilteredProfit();
  const firstName = ws.user?.name.split(" ")[0] ?? "";

  const monthly = useMemo(() => {
    const months = new Map<string, true>();
    records.forEach((r) => months.set(r.date.slice(0, 7), true));
    expenses.forEach((e) => months.set(e.date.slice(0, 7), true));
    return [...months.keys()]
      .sort()
      .slice(-12)
      .map((m) => {
        const r = records.filter((x) => x.date.startsWith(m));
        const e = filterExpenses(expenses, { storeId: "all", from: `${m}-01`, to: `${m}-31` });
        const mb = calculateProfit(r, e, ws.products);
        return { month: formatPeriod(m), "Net satış": mb.netSales, "Net kâr": mb.netProfit };
      });
  }, [records, expenses, ws.products]);

  const costed = ws.products.filter((p) => p.unitCost != null).length;
  const steps = [
    { done: ws.stores.length > 0, label: "Mağaza ekleyin", to: "/magazalar" as const },
    {
      done: ws.products.length > 0 && costed === ws.products.length,
      label:
        ws.products.length === 0
          ? "Ürün ve birim maliyet girin"
          : `Ürün maliyetleri (${costed}/${ws.products.length} ürün)`,
      to: "/urunler" as const,
    },
    { done: ws.orders.length > 0, label: "Satış / iade / iptal kaydı ekleyin", to: "/siparisler" as const },
    { done: ws.expenses.length > 0, label: "Giderlerinizi girin", to: "/giderler" as const },
    { done: ws.reconciliations.length > 0, label: "Pazaryeri raporuyla mutabakat yapın", to: "/raporlar/mutabakat" as const },
  ];

  const recent = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const storeName = (id: string) => ws.stores.find((s) => s.id === id)?.name ?? "—";

  if (ws.stores.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Genel Bakış" title={`Hoş geldiniz${firstName ? `, ${firstName}` : ""}`} />
        <EmptyState
          icon={<Store />}
          title="Başlamak için ilk mağazanızı ekleyin"
          description="Henüz hiçbir veri yok. Mağaza ekledikten sonra ürün maliyetlerini, siparişleri ve giderleri girerek gerçek kârınızı hesaplayabilirsiniz."
          action={
            <Button asChild>
              <Link to="/magazalar">
                Mağaza ekle <ArrowRight />
              </Link>
            </Button>
          }
        />
        <SetupSteps steps={steps} className="mt-6" />
      </>
    );
  }

  const kpis = [
    { label: "Brüt satış", value: formatTRY(b.grossSales), sub: `${b.counts.sales} satış kaydı` },
    { label: "Net satış", value: formatTRY(b.netSales), sub: `${b.counts.returns} iade · ${b.counts.cancellations} iptal` },
    { label: "Net kâr", value: formatTRY(b.netProfit), sub: `${b.counts.expenses} gider kaydı dahil`, tone: b.netProfit < 0 ? "neg" : "pos" },
    { label: "Kâr marjı", value: formatPercent(b.margin), sub: "Net kâr / net satış" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Genel Bakış"
        title={`Hoş geldiniz${firstName ? `, ${firstName}` : ""}`}
        description="Tüm rakamlar yalnızca sizin girdiğiniz kayıtlardan hesaplanır."
      />
      <FilterBar stores={ws.stores} />

      {!hasData ? (
        <EmptyState
          icon={<LayoutDashboard />}
          title="Bu filtrede kayıt yok"
          description="Seçili mağaza ve dönem için sipariş veya gider kaydı bulunmuyor. Kayıt ekledikçe özet burada oluşur."
          action={
            <Button asChild>
              <Link to="/siparisler">Sipariş kaydı ekle</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k, i) => (
              <div
                key={k.label}
                className="animate-rise rounded-xl border bg-card p-4 shadow-card"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{k.label}</span>
                  {b.sources.imported === 0 && <SourceBadge source="manual" />}
                </div>
                <div
                  className={cn(
                    "num mt-2 text-xl font-semibold sm:text-2xl",
                    k.tone === "neg" && "text-destructive",
                    k.tone === "pos" && "text-success",
                  )}
                >
                  {k.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{k.sub}</div>
              </div>
            ))}
          </div>
          {b.missingCostRecords > 0 && (
            <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
              {b.missingCostRecords} satış kaydında ürün maliyeti eksik; net kâr olduğundan yüksek görünebilir.{" "}
              <Link to="/urunler" className="font-semibold underline">
                Maliyetleri tamamlayın
              </Link>
            </p>
          )}
        </>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Aylık net satış ve net kâr"
          description={filters.storeId === "all" ? "Tüm mağazalar" : storeName(filters.storeId)}
        >
          {monthly.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Grafik için henüz kayıt yok.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tickFormatter={(v: number) => new Intl.NumberFormat("tr-TR", { notation: "compact" }).format(v)}
                  />
                  <Tooltip
                    formatter={(v: number) => formatTRY(v)}
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="Net satış" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Net kâr" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <div className="space-y-6">
          <SetupSteps steps={steps} />
          <Panel title="Pazaryeri bağlantıları">
            <ul className="space-y-2">
              {ws.stores.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{s.name}</span>
                  <Badge variant="neutral" className="gap-1">
                    <PlugZap className="size-3" /> Bağlı değil
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Otomatik veri aktarımı henüz yok; tüm veriler manuel girilir.
            </p>
          </Panel>
        </div>
      </div>

      <Panel
        className="mt-6"
        title="Son kayıtlar"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/siparisler">
              Tümü <ArrowRight />
            </Link>
          </Button>
        }
      >
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Bu filtrede sipariş kaydı yok.</p>
        ) : (
          <ul className="divide-y">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant={r.type === "sale" ? "success" : r.type === "return" ? "warning" : "outline"}>
                    {RECORD_TYPE_LABELS[r.type]}
                  </Badge>
                  <span className="num truncate">#{r.orderNumber}</span>
                  <span className="hidden text-muted-foreground sm:inline">· {storeName(r.storeId)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>
                  <Money value={r.type === "sale" ? r.grossAmount : -r.grossAmount} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function SetupSteps({
  steps,
  className,
}: {
  steps: { done: boolean; label: string; to: "/magazalar" | "/urunler" | "/siparisler" | "/giderler" | "/raporlar/mutabakat" }[];
  className?: string;
}) {
  const done = steps.filter((s) => s.done).length;
  return (
    <Panel title="Kurulum adımları" description={`${done}/${steps.length} tamamlandı`} className={className}>
      <ol className="space-y-1">
        {steps.map((s) => (
          <li key={s.label}>
            <Link
              to={s.to}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              {s.done ? (
                <Check className="size-4 text-success" />
              ) : (
                <Circle className="size-4 text-muted-foreground" />
              )}
              <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
