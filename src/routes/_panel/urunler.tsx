import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDelete } from "@/components/app/ConfirmDelete";
import { NeedStore } from "@/components/app/NeedStore";
import { EmptyState, Field, PageHeader, SourceBadge } from "@/components/app/ui-bits";
import { useWorkspace } from "@/lib/data/hooks";
import { deleteProduct, setUnitCost, upsertProduct } from "@/lib/data/repo";
import { VAT_RATES } from "@/lib/domain/labels";
import { optionalMoneyField, productSchema, toFieldErrors, type FieldErrors } from "@/lib/domain/schemas";
import type { Product } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_panel/urunler")({
  head: () => ({
    meta: [
      { title: "Ürünler — Smart Bussines Center" },
      { name: "description", content: "Ürünlerinizi ve birim maliyetlerini yönetin." },
      { property: "og:title", content: "Ürünler — Smart Bussines Center" },
      { property: "og:description", content: "Ürün birim maliyetleri ve KDV oranları." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Products,
});

function Products() {
  const ws = useWorkspace();
  const [storeFilter, setStoreFilter] = useState("all");
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editing, setEditing] = useState<Product | null | "new">(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return ws.products
      .filter((p) => storeFilter === "all" || p.storeId === storeFilter)
      .filter((p) => !onlyMissing || p.unitCost == null)
      .filter(
        (p) =>
          !needle ||
          p.name.toLocaleLowerCase("tr").includes(needle) ||
          p.sku.toLocaleLowerCase("tr").includes(needle) ||
          p.barcode.includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [ws.products, storeFilter, q, onlyMissing]);

  const missing = ws.products.filter((p) => p.unitCost == null).length;
  const storeName = (id: string) => ws.stores.find((s) => s.id === id)?.name ?? "—";

  if (ws.stores.length === 0)
    return (
      <>
        <PageHeader eyebrow="Ürünler" title="Ürünler ve maliyetler" />
        <NeedStore what="Ürünler" />
      </>
    );

  return (
    <>
      <PageHeader
        eyebrow="Ürünler"
        title="Ürünler ve maliyetler"
        description="Birim maliyet, kârlılıkta 'Ürün maliyeti' satırını oluşturur. Boş bırakılan maliyet 'bilinmiyor' olarak işaretlenir."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> Ürün ekle
          </Button>
        }
      />

      {ws.products.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="Henüz ürün yok"
          description="Ürünlerinizi stok kodu ve birim maliyetiyle ekleyin. Pazaryeri bağlantısı geldiğinde ürünler otomatik aktarılabilecek."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus /> İlk ürünü ekle
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="bg-card pl-9"
                placeholder="Ürün adı, stok kodu veya barkod ara"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Ürün ara"
              />
            </div>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="bg-card sm:w-52" aria-label="Mağaza">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm mağazalar</SelectItem>
                {ws.stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant={onlyMissing ? "accent" : "outline"} onClick={() => setOnlyMissing((v) => !v)}>
              Maliyeti eksik ({missing})
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>Mağaza</TableHead>
                  <TableHead className="text-right">KDV</TableHead>
                  <TableHead className="w-44 text-right">Birim maliyet (₺)</TableHead>
                  <TableHead>Kaynak</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Filtreye uyan ürün yok.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="num text-xs text-muted-foreground">
                          {p.sku}
                          {p.barcode && ` · ${p.barcode}`}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{storeName(p.storeId)}</TableCell>
                      <TableCell className="num text-right text-sm">%{p.vatRate}</TableCell>
                      <TableCell className="text-right">
                        <InlineCost product={p} tenantId={ws.tenantId} />
                      </TableCell>
                      <TableCell>
                        <SourceBadge source={p.source} verified={p.verified} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" aria-label="Düzenle" onClick={() => setEditing(p)}>
                            <Pencil />
                          </Button>
                          <ConfirmDelete
                            trigger={
                              <Button variant="ghost" size="icon" aria-label="Sil">
                                <Trash2 />
                              </Button>
                            }
                            title={`"${p.name}" silinsin mi?`}
                            description="Bu ürüne bağlı sipariş kayıtları silinmez, ancak ürün bağlantıları kaldırılır ve maliyetleri hesaplanamaz."
                            onConfirm={() => {
                              deleteProduct(ws.tenantId, p.id);
                              toast.success("Ürün silindi");
                            }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatNumber(rows.length)} ürün gösteriliyor · maliyet hücresine tıklayıp değeri değiştirip Enter'a basın.
          </p>
        </>
      )}

      <ProductDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        editing={editing}
        onClose={() => setEditing(null)}
        tenantId={ws.tenantId}
        stores={ws.stores}
        defaultStore={storeFilter !== "all" ? storeFilter : ws.stores[0]?.id}
      />
    </>
  );
}

function InlineCost({ product, tenantId }: { product: Product; tenantId: string }) {
  const initial = product.unitCost == null ? "" : String(product.unitCost).replace(".", ",");
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function commit() {
    if (value === initial) return;
    const r = optionalMoneyField("Birim maliyet").safeParse(value);
    if (!r.success) {
      setError(r.error.issues[0].message);
      return;
    }
    setError(null);
    setUnitCost(tenantId, product.id, r.data);
    toast.success(r.data == null ? "Maliyet 'bilinmiyor' olarak işaretlendi" : "Birim maliyet kaydedildi");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {product.unitCost == null && <Badge variant="warning">Eksik</Badge>}
        <Input
          aria-label={`${product.name} birim maliyet`}
          aria-invalid={!!error}
          className="num h-8 w-28 bg-background text-right"
          inputMode="decimal"
          placeholder="—"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

function ProductDialog({
  editing,
  onClose,
  tenantId,
  stores,
  defaultStore,
}: {
  editing: Product | null | "new";
  onClose: () => void;
  tenantId: string;
  stores: { id: string; name: string }[];
  defaultStore?: string;
}) {
  const p = editing && editing !== "new" ? editing : null;
  const [storeId, setStoreId] = useState(p?.storeId ?? defaultStore ?? "");
  const [vatRate, setVatRate] = useState(String(p?.vatRate ?? 20));
  const [errors, setErrors] = useState<FieldErrors>({});

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = productSchema.safeParse({
      storeId,
      name: fd.get("name"),
      sku: fd.get("sku"),
      barcode: fd.get("barcode"),
      unitCost: fd.get("unitCost"),
      vatRate,
    });
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    try {
      upsertProduct(tenantId, parsed.data, p?.id);
      toast.success(p ? "Ürün güncellendi" : "Ürün eklendi");
      onClose();
    } catch (err) {
      setErrors({ sku: (err as Error).message });
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{p ? "Ürünü düzenle" : "Ürün ekle"}</DialogTitle>
          <DialogDescription>Manuel girilen ürünler "Manuel" olarak işaretlenir.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Mağaza" htmlFor="pd-store" error={errors.storeId} className="sm:col-span-2">
            <Select value={storeId} onValueChange={setStoreId} disabled={!!p}>
              <SelectTrigger id="pd-store">
                <SelectValue placeholder="Mağaza seçin" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ürün adı" htmlFor="pd-name" error={errors.name} className="sm:col-span-2">
            <Input id="pd-name" name="name" defaultValue={p?.name} />
          </Field>
          <Field label="Stok kodu (SKU)" htmlFor="pd-sku" error={errors.sku}>
            <Input id="pd-sku" name="sku" defaultValue={p?.sku} className="num" />
          </Field>
          <Field label="Barkod" htmlFor="pd-barcode" error={errors.barcode} hint="İsteğe bağlı">
            <Input id="pd-barcode" name="barcode" defaultValue={p?.barcode} className="num" />
          </Field>
          <Field
            label="Birim maliyet (₺, KDV hariç)"
            htmlFor="pd-cost"
            error={errors.unitCost}
            hint="Bilmiyorsanız boş bırakın."
          >
            <Input
              id="pd-cost"
              name="unitCost"
              inputMode="decimal"
              placeholder="Örn. 149,90"
              className="num"
              defaultValue={p?.unitCost == null ? "" : String(p.unitCost).replace(".", ",")}
            />
          </Field>
          <Field label="KDV oranı" htmlFor="pd-vat" error={errors.vatRate}>
            <Select value={vatRate} onValueChange={setVatRate}>
              <SelectTrigger id="pd-vat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VAT_RATES.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    %{r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit">{p ? "Kaydet" : "Ekle"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
