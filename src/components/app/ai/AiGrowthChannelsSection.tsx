import { Filter, Megaphone, MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, Panel } from "@/components/app/ui-bits";
import type { AdvertisingAnalysis, FunnelAnalysis } from "@/lib/domain/ai-analytics";
import type { ReviewsAndReturnsAnalysis } from "@/lib/domain/ai-insights";
import { formatNumber, formatPercent } from "@/lib/format";

export function AiGrowthChannelsSection({
  funnel,
  advertising,
  reviewsAndReturns,
  targetMarginPct,
  onTargetMarginChange,
}: {
  funnel: FunnelAnalysis;
  advertising: AdvertisingAnalysis;
  reviewsAndReturns: ReviewsAndReturnsAnalysis;
  targetMarginPct: number;
  onTargetMarginChange: (pct: number) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Satış Hunisi */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Filter className="size-4 text-primary" /> Satış Hunisi
          </span>
        }
        description="Görüntülenme → Sepete ekleme → Sipariş → Dönüşüm oranı. Veri olmayan adımlarda tahmin yürütülmez."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">Görüntülenme</div>
            <div className="mt-1 text-lg font-semibold">
              {funnel.views != null ? formatNumber(funnel.views) : "Veri henüz yok"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {funnel.hasFunnelData ? "Trendyol huni verisi" : "Trendyol'dan alınması gerekiyor"}
            </div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">Sepete ekleme</div>
            <div className="mt-1 text-lg font-semibold">
              {funnel.addToCart != null ? formatNumber(funnel.addToCart) : "Veri henüz yok"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {funnel.hasFunnelData ? "Trendyol huni verisi" : "Trendyol'dan alınması gerekiyor"}
            </div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">Sipariş (gerçek)</div>
            <div className="mt-1 text-lg font-semibold num">{formatNumber(funnel.ordersFromRecords)}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Kaynak: Mevcut satış sipariş kayıtları</div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">Dönüşüm oranı</div>
            <div className="mt-1 text-lg font-semibold">
              {funnel.conversionRate != null ? formatPercent(funnel.conversionRate) : "Hesaplanamadı"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {funnel.cartToOrderRate != null
                ? `Sepet → sipariş: ${formatPercent(funnel.cartToOrderRate)}`
                : "Görüntülenme/sepet verisi eksik"}
            </div>
          </div>
        </div>
        {funnel.missingDataNotice && (
          <p className="mt-3 rounded-lg border border-dashed bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
            {funnel.missingDataNotice}
          </p>
        )}
        {funnel.opportunities.length > 0 && (
          <div className="mt-3 space-y-2">
            {funnel.opportunities.map((opp) => (
              <div key={`${opp.productId ?? "all"}-${opp.kind}`} className="rounded-lg border bg-secondary/40 p-3 text-xs">
                <div className="font-semibold text-foreground">{opp.productName}</div>
                <p className="mt-0.5 text-muted-foreground">{opp.reason}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Reklam ve ROAS */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Megaphone className="size-4 text-primary" /> Reklam Verimliliği ve ROAS Rehberi
          </span>
        }
        description="Platform reklam performansı (ad_daily_performance) ile manuel reklam giderleri ayrı gösterilir. Otomatik bütçe değişikliği yapılmaz."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">Platform reklam harcaması</div>
            <div className="mt-1 text-lg font-semibold">
              {advertising.platformSpend != null ? <Money value={advertising.platformSpend} /> : "Veri henüz yok"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Manuel reklam gideri: <Money value={advertising.manualAdExpense} />
            </div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">Reklam geliri</div>
            <div className="mt-1 text-lg font-semibold">
              {advertising.platformRevenue != null ? <Money value={advertising.platformRevenue} /> : "Veri henüz yok"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Kaynak: ad_daily_performance</div>
          </div>
          <div className="rounded-lg border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">Gerçekleşen ROAS</div>
            <div className="mt-1 text-lg font-semibold num">
              {advertising.roas != null ? `${advertising.roas.toFixed(2)}x` : "Hesaplanamadı"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Reklam geliri / reklam harcaması</div>
          </div>
          <div className="rounded-lg border bg-secondary/40 p-3.5">
            <div className="text-xs text-muted-foreground">Başabaş / Hedef ROAS</div>
            <div className="mt-1 text-lg font-semibold num">
              {advertising.breakEvenRoas != null ? `${advertising.breakEvenRoas.toFixed(2)}x` : "—"}
              {" / "}
              {advertising.targetRoas != null ? `${advertising.targetRoas.toFixed(2)}x` : "—"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Hedef net marj: %{advertising.targetNetMarginPct}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-paper p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted-foreground">{advertising.guidanceNote}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Label htmlFor="target-margin-pct" className="text-xs whitespace-nowrap">
              Hedef net marj (%)
            </Label>
            <Input
              id="target-margin-pct"
              type="number"
              min={0}
              max={70}
              className="h-8 w-20 bg-card text-right num"
              value={targetMarginPct}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onTargetMarginChange(v);
              }}
            />
          </div>
        </div>

        {advertising.missingDataNotice && (
          <p className="mt-3 rounded-lg border border-dashed bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
            {advertising.missingDataNotice}
          </p>
        )}

        {advertising.campaigns.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kampanya</TableHead>
                  <TableHead className="text-right">Harcama</TableHead>
                  <TableHead className="text-right">Reklam geliri</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead className="text-right">Tıklama / CTR</TableHead>
                  <TableHead className="text-right">Sipariş</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advertising.campaigns.map((c) => (
                  <TableRow key={c.campaignName}>
                    <TableCell className="font-medium">{c.campaignName}</TableCell>
                    <TableCell className="text-right"><Money value={c.spend} /></TableCell>
                    <TableCell className="text-right"><Money value={c.revenue} /></TableCell>
                    <TableCell className="num text-right">{c.roas != null ? `${c.roas.toFixed(2)}x` : "—"}</TableCell>
                    <TableCell className="num text-right text-xs">
                      {formatNumber(c.clicks)} ({formatPercent(c.ctr)})
                    </TableCell>
                    <TableCell className="num text-right">{formatNumber(c.ordersCount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      {/* Müşteri Yorumları ve İade/İptal Nedenleri */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <MessageSquareWarning className="size-4 text-primary" /> Müşteri Yorumları ve İade / İptal Analizi
          </span>
        }
        description="Müşteri yorum verisi varsa tarih filtresine göre puan/tema analizi; ek olarak gerçek iade ve iptal dağılımı."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-background/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Müşteri Yorumları</h3>
              <Badge variant={reviewsAndReturns.hasReviewData ? "verified" : "neutral"}>
                {reviewsAndReturns.hasReviewData ? `${reviewsAndReturns.reviewCount} yorum` : "Veri henüz yok"}
              </Badge>
            </div>
            {!reviewsAndReturns.hasReviewData ? (
              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{reviewsAndReturns.reviewNotice}</p>
            ) : (
              <div className="mt-3 space-y-3 text-xs">
                <div>
                  Ortalama puan:{" "}
                  <strong className="num text-sm">{reviewsAndReturns.averageRating?.toFixed(2) ?? "—"} / 5</strong>
                </div>
                <div className="space-y-1">
                  {reviewsAndReturns.ratingDistribution.map((r) => (
                    <div key={r.rating} className="flex items-center justify-between">
                      <span>{r.rating} yıldız</span>
                      <span className="num font-medium">{r.count}</span>
                    </div>
                  ))}
                </div>
                {reviewsAndReturns.reviewThemes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {reviewsAndReturns.reviewThemes.map((t) => (
                      <Badge key={t.theme} variant={t.kind === "sikayet" ? "manual" : "verified"}>
                        {t.theme}: {t.count}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-background/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Gerçek İade ve İptal Dağılımı</h3>
              <Badge variant="info">Sipariş & İade kayıtları</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-lg border bg-card p-2.5">
                <div className="text-muted-foreground">Onaylı İade</div>
                <div className="mt-1 text-base font-bold num">{reviewsAndReturns.returns.units} adet</div>
                <div className="text-muted-foreground">
                  <Money value={reviewsAndReturns.returns.amount} /> ({formatPercent(reviewsAndReturns.returns.rateOfGrossUnits)})
                </div>
              </div>
              <div className="rounded-lg border bg-card p-2.5">
                <div className="text-muted-foreground">İptal</div>
                <div className="mt-1 text-base font-bold num">{reviewsAndReturns.cancellations.units} adet</div>
                <div className="text-muted-foreground">
                  <Money value={reviewsAndReturns.cancellations.amount} /> ({formatPercent(reviewsAndReturns.cancellations.rateOfGrossUnits)})
                </div>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] text-muted-foreground">{reviewsAndReturns.returnReasonNotice}</p>
            {reviewsAndReturns.topIssueProducts.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t pt-2.5 text-xs">
                {reviewsAndReturns.topIssueProducts.map((p) => (
                  <li key={p.productName} className="flex items-center justify-between gap-2">
                    <span className="truncate text-foreground">{p.productName}</span>
                    <span className="num shrink-0 text-muted-foreground">
                      {p.returnedUnits} iade · {p.cancelledUnits} iptal ({formatPercent(p.issueRate)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}