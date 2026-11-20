import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowRight, Download, FileSpreadsheet, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/components/app/filters";
import { STATEMENT_LINES } from "@/components/app/statement";
import { useFilteredProfit } from "@/components/app/useProfit";
import { EmptyState, Money, PageHeader, Panel } from "@/components/app/ui-bits";
import { activePeriods, calculateProfit, periodRange, inRange } from "@/lib/domain/profitability";
import { formatPercent, formatPeriod } from "@/lib/format";

export const Route = createFileRoute("/_panel/raporlar/")({
  head: () => ({
    meta: [
      { title: "Raporlar — Smart Bussines Center" },
      { name: "description", content: "Aylık kârlılık özeti, CSV dışa aktarma ve pazaryeri mutabakatı." },
      { property: "og:title", content: "Raporlar — Smart Bussines Center" },
      { property: "og:description", content: "Aylık kârlılık raporları ve mutabakat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reports,
});

function Reports() {
  const { ws, records, expenses, hasData } = useFilteredProfit();

  const months = useMemo(
    () =>
      activePeriods(records, expenses).map((period) => {
        const range = periodRange(period);
        const b = calculateProfit(
          records.filter((r) => inRange(r.date, range)),
          expenses.filter((e) => inRange(e.date, range)),
          ws.products,
        );
        return { period, b };
      }),
    [records, expenses, ws.products],
  );

  function exportCsv() {
    const num = (n: number) => n.toFixed(2).replace(".", ",");
    const header = ["Dönem", ...STATEMENT_LINES.map((l) => l.label), "Kâr marjı", "Kaynak"];
    const lines = months.map(({ period, b }) => [
      period,
      ...STATEMENT_LINES.map((l) => num(b[l.key])),
      b.margin == null ? "" : (b.margin * 100).toFixed(1).replace(".", ","),
      b.sources.imported === 0 ? "Manuel" : "Karma",
    ]);
    const csv = "\uFEFF" + [header, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `smart-bussines-center-aylik-ozet.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        eyebrow="Raporlar"
        title="Raporlar"
        description="Girdiğiniz kayıtlardan oluşan aylık kârlılık özeti."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={months.length === 0}>
            <Download /> CSV indir
          </Button>
        }
      />

      <Link
        to="/raporlar/mutabakat"
        className="group mb-6 flex items-center justify-between gap-4 rounded-xl border bg-paper p-5 transition-colors hover:bg-secondary"
      >
        <div className="flex items-center gap-4">
          <span className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Scale className="size-5" />
          </span>
          <div>
            <div className="font-semibold">Pazaryeri mutabakatı</div>
            <div className="text-sm text-muted-foreground">
              Trendyol hakediş raporundaki toplamları uygulama toplamlarıyla karşılaştırın, farkları görün.
            </div>
          </div>
        </div>
        <ArrowRight className="size-5 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
      </Link>

      <FilterBar stores={ws.stores} />

      {!hasData ? (
        <EmptyState
          icon={<FileSpreadsheet />}
          title="Rapor oluşturacak kayıt yok"
          description="Sipariş veya gider kaydı eklediğinizde aylık özet burada otomatik oluşur."
        />
      ) : (
        <Panel title="Aylık özet" description={`${months.length} dönem`}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dönem</TableHead>
                  <TableHead className="text-right">Brüt satış</TableHead>
                  <TableHead className="text-right">İptal + iade</TableHead>
                  <TableHead className="text-right">Net satış</TableHead>
                  <TableHead className="text-right">Kesinti ve giderler</TableHead>
                  <TableHead className="text-right">Net kâr</TableHead>
                  <TableHead className="text-right">Marj</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map(({ period, b }) => (
                  <TableRow key={period}>
                    <TableCell className="font-medium">{formatPeriod(period)}</TableCell>
                    <TableCell className="text-right"><Money value={b.grossSales} /></TableCell>
                    <TableCell className="text-right"><Money value={b.cancellations + b.returns} /></TableCell>
                    <TableCell className="text-right"><Money value={b.netSales} /></TableCell>
                    <TableCell className="text-right"><Money value={b.netSales - b.netProfit} /></TableCell>
                    <TableCell className="text-right font-semibold"><Money value={b.netProfit} /></TableCell>
                    <TableCell className="num text-right">{formatPercent(b.margin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}
    </>
  );
}
