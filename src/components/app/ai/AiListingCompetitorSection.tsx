import { useState } from "react";
import { ClipboardCheck, Plus, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, Panel } from "@/components/app/ui-bits";
import type { CompetitorAnalysis, ListingChecklistItem } from "@/lib/domain/ai-insights";
import type { Product, Store } from "@/lib/domain/types";
import { formatDate, parseAmount, todayISO } from "@/lib/format";

const SEVERITY_BADGE: Record<ListingChecklistItem["severity"], { label: string; variant: "manual" | "info" | "neutral" }> = {
  yuksek: { label: "Yüksek öncelik", variant: "manual" },
  orta: { label: "Orta öncelik", variant: "info" },
  bilgi: { label: "İyileştirme", variant: "neutral" },
};

export function AiListingCompetitorSection({
  listing,
  competitors,
  stores,
  products,
  selectedStoreId,
  onAddCompetitor,
  onDeleteCompetitor,
}: {
  listing: ListingChecklistItem[];
  competitors: CompetitorAnalysis;
  stores: Store[];
  products: Product[];
  selectedStoreId: string | "all";
  onAddCompetitor: (input: {
    storeId: string;
    productId: string | null;
    competitorName: string;
    competitorProduct: string;
    competitorPrice: number;
    observedDate: string;
    note: string;
  }) => void;
  onDeleteCompetitor: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [storeId, setStoreId] = useState(selectedStoreId !== "all" ? selectedStoreId : (stores[0]?.id ?? ""));
  const [productId, setProductId] = useState<string>("none");
  const [competitorName, setCompetitorName] = useState("");
  const [competitorProduct, setCompetitorProduct] = useState("");
  const [priceText, setPriceText] = useState("");
  const [observedDate, setObservedDate] = useState(todayISO());
  const [note, setNote] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetStore = storeId || stores[0]?.id || "";
    const price = parseAmount(priceText);
    if (!targetStore) {
      toast.error("Önce bir mağaza seçin.");
      return;
    }
    if (!competitorName.trim() || !competitorProduct.trim()) {
      toast.error("Rakip satıcı ve ürün adı zorunludur.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Geçerli bir pozitif rakip fiyatı girin.");
      return;
    }
    onAddCompetitor({
      storeId: targetStore,
      productId: productId === "none" ? null : productId,
      competitorName: competitorName.trim(),
      competitorProduct: competitorProduct.trim(),
      competitorPrice: price,
      observedDate: observedDate || todayISO(),
      note: note.trim(),
    });
    setCompetitorName("");
    setCompetitorProduct("");
    setPriceText("");
    setNote("");
    setShowForm(false);
    toast.success("Manuel rakip gözlemi kaydedildi.");
  }

  return (
    <div className="space-y-6">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-primary" /> Ürün / Listeleme İyileştirme Kontrol Listesi (
            {listing.length})
          </span>
        }
        description="Gerçek katalog başlığı, varyant ölçüleri, stok ve iade sinyallerine göre üretilir. Trendyol listeleme içerikleri otomatik değiştirilmez."
      >
        {listing.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Mevcut katalog ve sipariş verilerinde otomatik tespit edilen bir ölçü/varyant/listeleme uyarısı yok.
          </p>
        ) : (
          <div className="space-y-3">
            {listing.map((item) => {
              const sev = SEVERITY_BADGE[item.severity];
              return (
                <article key={item.id} className="rounded-xl border bg-background/60 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                    <Badge variant={sev.variant}>{sev.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs font-medium text-primary">{item.productName}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{item.detail}</p>
                  <div className="mt-2 rounded-lg bg-muted/45 px-3 py-2 text-[11px] text-foreground/85">
                    <strong>Sinyal:</strong> {item.signal}{" "}
                    <span className="text-muted-foreground">· Kaynak: {item.dataSource}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Scale className="size-4 text-primary" /> Rakip Analizi
          </span>
        }
        description="Yalnızca kullanıcının kendi eklediği gerçek rakip gözlemleri gösterilir; uygulama rakip fiyatı uydurmaz."
        actions={
          stores.length > 0 ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
              <Plus className="size-3.5" /> {showForm ? "Formu kapat" : "Manuel rakip ekle"}
            </Button>
          ) : undefined
        }
      >
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-4 grid gap-3 rounded-xl border bg-paper p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="bg-card" aria-label="Mağaza">
                <SelectValue placeholder="Mağaza seçin" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="bg-card" aria-label="Karşılaştırılacak ürün">
                <SelectValue placeholder="Kendi ürününüz (opsiyonel)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ürün bağlama (genel)</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="bg-card"
              placeholder="Rakip satıcı / marka"
              value={competitorName}
              onChange={(e) => setCompetitorName(e.target.value)}
            />
            <Input
              className="bg-card"
              placeholder="Rakip ürün başlığı / ölçüsü"
              value={competitorProduct}
              onChange={(e) => setCompetitorProduct(e.target.value)}
            />
            <Input
              className="bg-card"
              placeholder="Rakip fiyatı (₺)"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
            />
            <Input
              type="date"
              className="bg-card"
              aria-label="Gözlem tarihi"
              value={observedDate}
              onChange={(e) => setObservedDate(e.target.value)}
            />
            <Input
              className="bg-card sm:col-span-2"
              placeholder="Not (opsiyonel — örn. kampanya, kargo ücretsiz)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button type="submit">Kaydet</Button>
          </form>
        )}

        {!competitors.hasData ? (
          <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            {competitors.emptyNotice}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Rakip & Ürün</TableHead>
                  <TableHead>Karşılaştırılan Ürünümüz</TableHead>
                  <TableHead className="text-right">Rakip Fiyatı</TableHead>
                  <TableHead className="text-right">Fiyat Aralığımız</TableHead>
                  <TableHead className="text-right">Kaynak</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.rows.map(({ entry, linkedProductName, ourPriceRange }) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDate(entry.observedDate)}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{entry.competitorName}</div>
                      <div className="text-muted-foreground">{entry.competitorProduct}</div>
                      {entry.note && <div className="text-[11px] text-muted-foreground">{entry.note}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{linkedProductName ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">
                      <Money value={entry.competitorPrice} />
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {ourPriceRange ? (
                        ourPriceRange.min === ourPriceRange.max ? (
                          <Money value={ourPriceRange.min} />
                        ) : (
                          <span>
                            <Money value={ourPriceRange.min} /> – <Money value={ourPriceRange.max} />
                          </span>
                        )
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="manual">Manuel</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        aria-label="Rakip kaydını sil"
                        onClick={() => onDeleteCompetitor(entry.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </div>
  );
}