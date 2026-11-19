import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AlertTriangle, BarChart3, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FilterBar } from "@/components/app/filters";
import { STATEMENT_LINES } from "@/components/app/statement";
import { useFilteredProfit } from "@/components/app/useProfit";
import { EmptyState, Money, PageHeader, Panel, SourceBadge } from "@/components/app/ui-bits";
import { calculateProfit } from "@/lib/domain/profitability";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/karlilik")({
  head: () => ({
    meta: [
      { title: "Kârlılık — Smart Bussines Center" },
      { name: "description", content: "Brüt satıştan net kâra kalem kalem şeffaf kârlılık hesabı." },
      { property: "og:title", content: "Kârlılık — Smart Bussines Center" },
      { property: "og:description", content: "Şeffaf kârlılık tablosu ve ürün bazında katkı." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Profitability,
});

function Profitability() {
  const { ws, records, breakdown: b, hasData } = useFilteredProfit();

  const perProduct = useMemo(() => {
    const ids = [...new Set(records.map((r) => r.productId ?? "__none"))];
    return ids
      .map((id) => {
        const recs = records.filter((r) => (r.productId ?? "__none") === id);
        const pb = calculateProfit(recs, [], ws.products);
        const product = ws.products.find((p) => p.id === id);
        const contribution = pb.netSales - pb.commission - pb.shipping - pb.taxes - pb.productCost;
        return {
          id,
          name: product?.name ?? "Ürün bağlanmamış kayıtlar",
          sku: product?.sku ?? "",
          hasCost: product?.unitCost != null,
          netUnits: pb.counts.soldUnits - pb.counts.returnedUnits - pb.counts.cancelledUnits,
          pb,
          contribution,
        };
      })
      .sort((a, b2) => b2.contribution - a.contribution);
  }, [records, ws.products]);

  return (
    <>
      <PageHeader
        eyebrow="Kârlılık"
        title="Kârlılık tablosu"
        description="Her satırın hangi kayıtlardan geldiği ve nasıl hesaplandığı açıkça gösterilir."
      />
      <FilterBar stores={ws.stores} />

      {!hasData ? (
        <EmptyState
          icon={<BarChart3 />}
          title="Hesaplanacak kayıt yok"
          description="Kârlılık tablosu; sipariş, iade, iptal ve gider kayıtlarınızdan oluşur. Seçili filtrede kayıt bulunmuyor."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/siparisler">Sipariş kaydı ekle</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/giderler">Gider ekle</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel
            title="Brüt satıştan net kâra"
            description={`${b.counts.sales} satış · ${b.counts.returns} iade · ${b.counts.cancellations} iptal · ${b.counts.expenses} gider`}
            actions={<SourceSummary manual={b.sources.manual} imported={b.sources.imported} />}
          >
            {b.missingCostRecords > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {b.missingCostRecords} satış kaydının ürün maliyeti bilinmiyor; bu kayıtlar için ürün maliyeti 0 kabul
                  edildi.{" "}
                  <Link to="/urunler" className="font-semibold underline">
                    Maliyetleri girin
                  </Link>
                </span>
              </div>
            )}
            <div className="overflow-hidden rounded-lg border">
              {STATEMENT_LINES.map((line) => {
                const value = b[line.key];
                const isTotal = line.kind === "total";
                const isSub = line.kind === "subtotal";
                return (
                  <div
                    key={line.key}
                    className={cn(
                      "flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm last:border-b-0",
                      isSub && "bg-secondary font-semibold",
                      isTotal && "bg-primary text-primary-foreground font-semibold",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="num w-3 text-center opacity-60">
                        {line.kind === "minus" ? "−" : isSub || isTotal ? "=" : ""}
                      </span>
                      <span className="truncate">{line.label}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" aria-label={`${line.label} nasıl hesaplanır`} className="opacity-50 hover:opacity-100">
                            <Info className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{line.explain}</TooltipContent>
                      </Tooltip>
                      {!isTotal && !isSub && (
                        <span className="hidden text-xs text-muted-foreground md:inline">· {line.from}</span>
                      )}
                    </div>
                    <Money value={value} sign={line.kind === "minus" ? "minus" : undefined} className={cn(isTotal && "text-base")} />
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Kâr marjı (net kâr / net satış): <span className="num font-semibold text-foreground">{formatPercent(b.margin)}</span>
            </p>
          </Panel>

          <Panel title="Hesaplama kuralları">
            <ul className="space-y-3 text-sm">
              {STATEMENT_LINES.map((l) => (
                <li key={l.key}>
                  <span className="font-medium">{l.label}:</span>{" "}
                  <span className="text-muted-foreground">{l.explain}</span>
                </li>
              ))}
              <li className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Mağaza filtresi seçildiğinde "Genel" (mağazaya bağlı olmayan) giderler hesaba katılmaz.
              </li>
            </ul>
          </Panel>

          <Panel title="Ürün bazında katkı" description="Genel giderler hariç: net satış − komisyon − kargo − stopaj − ürün maliyeti" className="xl:col-span-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün</TableHead>
                    <TableHead className="text-right">Net adet</TableHead>
                    <TableHead className="text-right">Net satış</TableHead>
                    <TableHead className="text-right">Komisyon</TableHead>
                    <TableHead className="text-right">Kargo</TableHead>
                    <TableHead className="text-right">Ürün maliyeti</TableHead>
                    <TableHead className="text-right">Katkı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perProduct.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {p.sku && <span className="num">{p.sku}</span>}
                          {!p.hasCost && <span className="text-warning-foreground">· maliyet eksik</span>}
                        </div>
                      </TableCell>
                      <TableCell className="num text-right">{formatNumber(p.netUnits)}</TableCell>
                      <TableCell className="text-right"><Money value={p.pb.netSales} /></TableCell>
                      <TableCell className="text-right"><Money value={p.pb.commission} /></TableCell>
                      <TableCell className="text-right"><Money value={p.pb.shipping} /></TableCell>
                      <TableCell className="text-right"><Money value={p.pb.productCost} /></TableCell>
                      <TableCell className="text-right font-semibold"><Money value={p.contribution} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

function SourceSummary({ manual, imported }: { manual: number; imported: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <SourceBadge source="manual" /> {manual} kayıt
      <SourceBadge source="imported" verified /> {imported} kayıt
    </div>
  );
}
