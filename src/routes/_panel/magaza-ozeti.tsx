import { createFileRoute } from "@tanstack/react-router";
import { FilterBar } from "@/components/app/filters";
import { useFilteredProfit } from "@/components/app/useProfit";
import { PageHeader, Panel, Money } from "@/components/app/ui-bits";
import { calculateSalesSummary } from "@/lib/domain/sales-summary";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_panel/magaza-ozeti")({
  head: () => ({
    meta: [
      { title: "Mağaza Özeti — Smart Bussines Center" },
      { name: "description", content: "Brüt satış, iade, iptal ve net satış özeti." },
    ],
  }),
  component: StoreSummary,
});

function StoreSummary() {
  const { ws, records, filters } = useFilteredProfit();
  const summary = calculateSalesSummary(records);
  const cards = [
    { title: "Brüt satış adedi", units: summary.gross.units, amount: summary.gross.amount },
    { title: "İade adedi", units: summary.returns.units, amount: summary.returns.amount },
    { title: "İptal adedi", units: summary.cancellations.units, amount: summary.cancellations.amount },
    { title: "Net satış adedi", units: summary.net.units, amount: summary.net.amount },
  ];
  const period = filters.from || filters.to
    ? `${filters.from ?? "Başlangıç"} – ${filters.to ?? "Bugün"}`
    : "Tüm zamanlar";

  return (
    <>
      <PageHeader
        eyebrow="Mağaza Özeti"
        title="Satış özeti"
        description={`${ws.stores.find((s) => s.id === filters.storeId)?.name ?? "Tüm mağazalar"} · ${period}`}
      />
      <FilterBar stores={ws.stores} />
      <Panel title="Satış adetleri ve tutarları" description="İade ve iptaller brüt satıştan düşülerek net satış hesaplanır. İndirim ve kuponlar bu ekranda düşülmez; kârlılık tablosunda ayrıca gösterilir.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.title} className="rounded-xl border bg-card p-4">
              <div className="text-sm text-muted-foreground">{card.title}</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(card.units)} adet</div>
              <div className="mt-1 text-sm text-muted-foreground"><Money value={card.amount} /></div>
            </div>
          ))}
        </div>
      </Panel>
      <p className="mt-4 text-xs text-muted-foreground">
        Hesaplama {records.length} sipariş / iade / iptal satırından yapılmıştır. İndirim, kupon, komisyon ve kargo bu satış özeti rakamlarına dahil değildir.
      </p>
    </>
  );
}
