import { useState } from "react";
import { ChevronDown, ChevronRight, Layers, Package, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, Panel } from "@/components/app/ui-bits";
import type { ProductAnalysis } from "@/lib/domain/ai-analytics";
import { formatNumber, formatPercent } from "@/lib/format";

export function AiProductsSection({ products }: { products: ProductAnalysis }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Package className="size-4 text-primary" /> Ürün Bazında Satış ve Kârlılık
          </span>
        }
        description="En çok satanlar ve net katkı kârı. Birim maliyeti girilmemiş ürünlerde uydurma kâr yazılmaz; 'Kâr hesaplanamadı' gösterilir. Genel mağaza giderleri (kira, reklam vb.) ürün satırına dağıtılmaz."
      >
        {products.topSellers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Seçili tarih aralığında satış kaydı olan ürün bulunmuyor.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-right">Brüt / Net adet</TableHead>
                  <TableHead className="text-right">İade / İptal</TableHead>
                  <TableHead className="text-right">Net satış</TableHead>
                  <TableHead className="text-right">Ürün katkı kârı</TableHead>
                  <TableHead className="text-right">Marj</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.topProfitable.map((row) => (
                  <TableRow key={row.productId ?? row.name}>
                    <TableCell className="max-w-xs">
                      <div className="font-medium text-foreground">{row.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.sku || row.barcode || "Kod yok"}
                        {row.unitCost != null ? ` · Birim maliyet: ${formatNumber(row.unitCost)} ₺` : " · Maliyet yok"}
                      </div>
                    </TableCell>
                    <TableCell className="num text-right">
                      {formatNumber(row.grossUnits)} / <strong>{formatNumber(row.netUnits)}</strong>
                    </TableCell>
                    <TableCell className="num text-right text-xs text-muted-foreground">
                      {row.returnedUnits} iade ({formatPercent(row.returnRate)}) · {row.cancelledUnits} iptal
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={row.netSales} />
                    </TableCell>
                    <TableCell className="text-right">
                      {row.profitStatus === "calculated" ? (
                        <Money value={row.netContribution} className="font-semibold" />
                      ) : (
                        <Badge variant="manual" className="text-[11px]">
                          Kâr hesaplanamadı (maliyet eksik)
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="num text-right">
                      {row.profitStatus === "calculated" ? formatPercent(row.margin) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Layers className="size-4 text-primary" /> Barkod / Varyant / Listeleme Karşılaştırması (
            {products.variantComparisons.length} ürün)
          </span>
        }
        description="Aynı ana ürüne ait barkod ve ölçü varyantlarının satış, iade, stok ve fiyat karşılaştırması. Kaynak: Trendyol ürün varyantları + sipariş barkod eşleşmesi."
      >
        {products.variantComparisons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Birden fazla varyanta sahip ürün bulunamadı veya katalog varyantları henüz eşitlenmedi.
          </p>
        ) : (
          <div className="space-y-2.5">
            {products.variantComparisons.map((prod) => {
              const key = prod.productId ?? prod.name;
              const open = expandedId === key;
              const dupeCount = prod.variants.filter((v) => v.duplicateName).length;
              return (
                <div key={key} className="rounded-xl border bg-background/60">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedId(open ? null : key)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{prod.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{prod.variants.length} varyant/barkod</span>
                          <span>·</span>
                          <span>{formatNumber(prod.netUnits)} net adet</span>
                          <span>·</span>
                          <span>Net satış: <Money value={prod.netSales} /></span>
                          {dupeCount > 0 && (
                            <Badge variant="manual" className="text-[10px]">
                              {dupeCount} yinelenen ölçü barkodu
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                  {open && (
                    <div className="overflow-x-auto border-t px-4 py-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Varyant / Ölçü</TableHead>
                            <TableHead>Barkod</TableHead>
                            <TableHead className="text-right">Satış fiyatı</TableHead>
                            <TableHead className="text-right">Stok</TableHead>
                            <TableHead className="text-right">Brüt / Net</TableHead>
                            <TableHead className="text-right">İade / İptal</TableHead>
                            <TableHead className="text-right">Net satış</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {prod.variants.map((v) => (
                            <TableRow key={`${key}-${v.barcode}-${v.variantName}`}>
                              <TableCell className="text-xs font-medium">
                                {v.variantName}
                                {v.duplicateName && (
                                  <Badge variant="outline" className="ml-1.5 text-[10px]">
                                    Yinelenen ad
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="num text-xs text-muted-foreground">{v.barcode}</TableCell>
                              <TableCell className="text-right text-xs">
                                {v.salePrice != null ? <Money value={v.salePrice} /> : "—"}
                              </TableCell>
                              <TableCell className="num text-right text-xs">
                                {v.stock != null ? formatNumber(v.stock) : "—"}
                              </TableCell>
                              <TableCell className="num text-right text-xs">
                                {v.grossUnits} / <strong>{v.netUnits}</strong>
                              </TableCell>
                              <TableCell className="num text-right text-xs text-muted-foreground">
                                {v.returnedUnits} / {v.cancelledUnits}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                <Money value={v.netSales} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <PackageX className="size-4 text-muted-foreground" /> Satışa Dönüşmeyen Ürünler (
            {products.unsoldProducts.length})
          </span>
        }
        description="Katalogda kayıtlı olup seçili tarih aralığında 0 sipariş alan ürünler."
      >
        {products.unsoldProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Seçili dönemde tüm katalog ürünleri en az bir sipariş aldı.</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {products.unsoldProducts.map((p) => (
              <div key={p.productId ?? p.name} className="rounded-lg border bg-background/60 p-3 text-xs">
                <div className="font-semibold text-foreground">{p.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span>{p.variants.length} varyant</span>
                  <span>·</span>
                  <span>
                    Toplam stok: {formatNumber(p.variants.reduce((acc, v) => acc + (v.stock ?? 0), 0))}
                  </span>
                  <span>·</span>
                  <span>{p.unitCost != null ? `Maliyet: ${formatNumber(p.unitCost)} ₺` : "Maliyet eksik"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}