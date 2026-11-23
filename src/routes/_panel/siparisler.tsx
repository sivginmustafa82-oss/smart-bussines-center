import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import * as XLSX from "xlsx";
import { Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDelete } from "@/components/app/ConfirmDelete";
import { FilterBar } from "@/components/app/filters";
import { NeedStore } from "@/components/app/NeedStore";
import { useFilteredProfit } from "@/components/app/useProfit";
import { EmptyState, Field, Money, PageHeader, SourceBadge } from "@/components/app/ui-bits";
import { upsertOrder, deleteOrder } from "@/lib/data/repo";
import { RECORD_TYPE_LABELS } from "@/lib/domain/labels";
import { buildOrderExportRows, ORDER_EXPORT_COLUMNS } from "@/lib/domain/order-export";
import { orderRecordSchema, toFieldErrors, type FieldErrors } from "@/lib/domain/schemas";
import type { OrderRecord, Product, RecordType, Store } from "@/lib/domain/types";
import { formatDate, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_panel/siparisler")({
  head: () => ({
    meta: [
      { title: "Siparişler — Smart Bussines Center" },
      { name: "description", content: "Satış, iade ve iptal kayıtlarınızı girin ve yönetin." },
      { property: "og:title", content: "Siparişler — Smart Bussines Center" },
      { property: "og:description", content: "Satış, iade ve iptal kayıtları." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Orders,
});

type Tab = "all" | RecordType;

function Orders() {
  const { ws, records } = useFilteredProfit();
  const [tab, setTab] = useState<Tab>("all");
  const [editing, setEditing] = useState<OrderRecord | null | "new">(null);

  const rows = useMemo(
    () =>
      records
        .filter((r) => tab === "all" || r.type === tab)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [records, tab],
  );
  const count = (t: RecordType) => records.filter((r) => r.type === t).length;
  const exportExcel = () => {
    const data = buildOrderExportRows(rows, ws.stores, ws.products);
    const sheet = XLSX.utils.aoa_to_sheet([ORDER_EXPORT_COLUMNS, ...data]);
    sheet["!cols"] = ORDER_EXPORT_COLUMNS.map((h, i) => ({
      wch: Math.max(h.length + 2, ...data.slice(0, 100).map((row) => String(row[i] ?? "").length + 2), 12),
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Siparişler");
    XLSX.writeFile(book, `smart-business-siparisler-${todayISO()}.xlsx`);
    toast.success(`${data.length} kayıt Excel'e aktarıldı`);
  };
  const storeName = (id: string) => ws.stores.find((s) => s.id === id)?.name ?? "—";
  const product = (id: string | null) => (id ? ws.products.find((p) => p.id === id) : undefined);

  if (ws.stores.length === 0)
    return (
      <>
        <PageHeader eyebrow="Siparişler" title="Sipariş, iade ve iptal kayıtları" />
        <NeedStore what="Sipariş kayıtları" />
      </>
    );

  return (
    <>
      <PageHeader
        eyebrow="Siparişler"
        title="Sipariş, iade ve iptal kayıtları"
        description="Pazaryeri bağlantısı olmadığı için tüm kayıtlar manuel girilir ve 'Manuel' olarak işaretlenir."
        actions={
          <Button variant="outline" onClick={exportExcel} disabled={rows.length === 0}>
            Excel'e aktar
          </Button>
          <Button onClick={() => setEditing("new")}>
            <Plus /> Kayıt ekle
          </Button>
        }
      />
      <FilterBar stores={ws.stores} />

      {ws.orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart />}
          title="Henüz sipariş kaydı yok"
          description="Satış, iade ve iptallerinizi ekleyin. Her kayıtta komisyon, kargo, indirim/kupon ve stopaj tutarlarını ayrı ayrı girebilirsiniz."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus /> İlk kaydı ekle
            </Button>
          }
        />
      ) : (
        <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-4">
            <TabsList>
              <TabsTrigger value="all">Tümü ({records.length})</TabsTrigger>
              <TabsTrigger value="sale">Satış ({count("sale")})</TabsTrigger>
              <TabsTrigger value="return">İade ({count("return")})</TabsTrigger>
              <TabsTrigger value="cancellation">İptal ({count("cancellation")})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Sipariş</TableHead>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-right">Adet</TableHead>
                  <TableHead className="text-right">Brüt</TableHead>
                  <TableHead className="text-right">İndirim + kupon</TableHead>
                  <TableHead className="text-right">Komisyon</TableHead>
                  <TableHead className="text-right">Kargo</TableHead>
                  <TableHead className="text-right">Stopaj</TableHead>
                  <TableHead>Kaynak</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">
                      Bu filtrede kayıt yok.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => {
                    const p = product(r.productId);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell>
                          <Badge variant={r.type === "sale" ? "success" : r.type === "return" ? "warning" : "outline"}>
                            {RECORD_TYPE_LABELS[r.type]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="num text-sm">#{r.orderNumber}</div>
                          <div className="text-xs text-muted-foreground">{storeName(r.storeId)}</div>
                        </TableCell>
                        <TableCell className="max-w-48 text-sm">
                          {p ? (
                            <span className="line-clamp-1">{p.name}</span>
                          ) : (
                            <span className="text-muted-foreground">Ürün bağlanmadı</span>
                          )}
                        </TableCell>
                        <TableCell className="num text-right">{r.quantity}</TableCell>
                        <TableCell className="text-right"><Money value={r.grossAmount} /></TableCell>
                        <TableCell className="text-right"><Money value={r.discountAmount + r.couponAmount} /></TableCell>
                        <TableCell className="text-right"><Money value={r.commissionAmount} /></TableCell>
                        <TableCell className="text-right"><Money value={r.shippingAmount} /></TableCell>
                        <TableCell className="text-right"><Money value={r.withholdingAmount} /></TableCell>
                        <TableCell><SourceBadge source={r.source} verified={r.verified} /></TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label="Düzenle" onClick={() => setEditing(r)} disabled={r.source === "imported"}>
                              <Pencil />
                            </Button>
                            <ConfirmDelete
                              trigger={
                                <Button variant="ghost" size="icon" aria-label="Sil">
                                  <Trash2 />
                                </Button>
                              }
                              title="Kayıt silinsin mi?"
                              description={`#${r.orderNumber} numaralı ${RECORD_TYPE_LABELS[r.type].toLocaleLowerCase("tr")} kaydı silinecek.`}
                              onConfirm={() => {
                                deleteOrder(ws.tenantId, r.id);
                                toast.success("Kayıt silindi");
                              }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <OrderDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        editing={editing}
        onClose={() => setEditing(null)}
        tenantId={ws.tenantId}
        stores={ws.stores}
        products={ws.products}
      />
    </>
  );
}

const amountText = (n: number | undefined) => (n ? String(n).replace(".", ",") : "");

function OrderDialog({
  editing,
  onClose,
  tenantId,
  stores,
  products,
}: {
  editing: OrderRecord | null | "new";
  onClose: () => void;
  tenantId: string;
  stores: Store[];
  products: Product[];
}) {
  const r = editing && editing !== "new" ? editing : null;
  const [type, setType] = useState<RecordType>(r?.type ?? "sale");
  const [storeId, setStoreId] = useState(r?.storeId ?? stores[0]?.id ?? "");
  const [productId, setProductId] = useState<string>(r?.productId ?? "none");
  const [errors, setErrors] = useState<FieldErrors>({});
  const storeProducts = products.filter((p) => p.storeId === storeId);
  const isSale = type === "sale";

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = orderRecordSchema.safeParse({
      ...fd,
      type,
      storeId,
      productId: productId === "none" ? null : productId,
    });
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    try {
      upsertOrder(tenantId, parsed.data, r?.id);
      toast.success(r ? "Kayıt güncellendi" : "Kayıt eklendi");
      onClose();
    } catch (err) {
      setErrors({ _form: (err as Error).message });
    }
  }

  const money = (name: keyof OrderRecord, label: string, hint?: string) => (
    <Field label={label} htmlFor={`od-${name}`} error={errors[name]} hint={hint}>
      <Input
        id={`od-${name}`}
        name={name}
        inputMode="decimal"
        placeholder="0,00"
        className="num"
        defaultValue={amountText(r?.[name] as number | undefined)}
      />
    </Field>
  );

  return (
    <Dialog open={editing !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{r ? "Kaydı düzenle" : "Sipariş kaydı ekle"}</DialogTitle>
          <DialogDescription>
            {isSale
              ? "Satıştaki tutarları siparişte gerçekleştiği şekliyle girin."
              : "İade/iptalde brüt tutar geri alınan satış tutarıdır; indirim, komisyon ve stopaj alanları geri alınan tutarlardır. Kargo ek maliyet olarak eklenir."}
          </DialogDescription>
        </DialogHeader>
        {errors._form && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errors._form}</p>
        )}
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Kayıt türü" htmlFor="od-type" error={errors.type}>
            <Select value={type} onValueChange={(v) => setType(v as RecordType)}>
              <SelectTrigger id="od-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RECORD_TYPE_LABELS) as RecordType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {RECORD_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mağaza" htmlFor="od-store" error={errors.storeId}>
            <Select
              value={storeId}
              onValueChange={(v) => {
                setStoreId(v);
                setProductId("none");
              }}
            >
              <SelectTrigger id="od-store">
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
          <Field label="Sipariş numarası" htmlFor="od-orderNumber" error={errors.orderNumber}>
            <Input id="od-orderNumber" name="orderNumber" className="num" defaultValue={r?.orderNumber} />
          </Field>
          <Field label="Tarih" htmlFor="od-date" error={errors.date}>
            <Input id="od-date" name="date" type="date" defaultValue={r?.date ?? todayISO()} />
          </Field>
          <Field
            label="Ürün"
            htmlFor="od-product"
            error={errors.productId}
            hint={storeProducts.length === 0 ? "Bu mağazada ürün yok; ürün maliyeti hesaplanamaz." : undefined}
          >
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="od-product">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ürün bağlama</SelectItem>
                {storeProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Adet" htmlFor="od-quantity" error={errors.quantity}>
            <Input id="od-quantity" name="quantity" type="number" min={1} step={1} className="num" defaultValue={r?.quantity ?? 1} />
          </Field>
          {money("grossAmount", isSale ? "Brüt satış tutarı (₺)" : "Geri alınan brüt tutar (₺)", "KDV dahil müşteri fiyatı × adet")}
          {money("commissionAmount", isSale ? "Komisyon (₺)" : "Geri alınan komisyon (₺)")}
          {money("discountAmount", isSale ? "Satıcı indirimi (₺)" : "Geri alınan indirim (₺)")}
          {money("couponAmount", isSale ? "Kupon (₺)" : "Geri alınan kupon (₺)")}
          {money("shippingAmount", isSale ? "Kargo (₺)" : "İade / ek kargo maliyeti (₺)")}
          {money("withholdingAmount", isSale ? "Stopaj (₺)" : "Geri alınan stopaj (₺)")}
          <Field label="Not" htmlFor="od-note" error={errors.note} className="sm:col-span-2">
            <Textarea id="od-note" name="note" rows={2} defaultValue={r?.note} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit">{r ? "Kaydet" : "Ekle"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
