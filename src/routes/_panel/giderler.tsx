import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
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
import { FilterBar } from "@/components/app/filters";
import { useFilteredProfit } from "@/components/app/useProfit";
import { EmptyState, Field, Money, PageHeader, SourceBadge } from "@/components/app/ui-bits";
import { deleteExpense, upsertExpense } from "@/lib/data/repo";
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from "@/lib/domain/labels";
import { expenseSchema, toFieldErrors, type FieldErrors } from "@/lib/domain/schemas";
import type { Expense, ExpenseCategory, Store } from "@/lib/domain/types";
import { formatDate, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_panel/giderler")({
  head: () => ({
    meta: [
      { title: "Giderler — Smart Bussines Center" },
      { name: "description", content: "Reklam, kargo, vergi ve diğer işletme giderlerinizi girin." },
      { property: "og:title", content: "Giderler — Smart Bussines Center" },
      { property: "og:description", content: "İşletme giderlerinin kategori bazında takibi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Expenses,
});

function Expenses() {
  const { ws, expenses } = useFilteredProfit();
  const [editing, setEditing] = useState<Expense | null | "new">(null);

  const rows = useMemo(
    () => [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [expenses],
  );
  const totals = useMemo(() => {
    const m = new Map<ExpenseCategory, number>();
    for (const e of expenses) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
    return EXPENSE_CATEGORIES.filter((c) => m.has(c.value)).map((c) => ({ ...c, total: m.get(c.value) ?? 0 }));
  }, [expenses]);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const storeName = (id: string | null) => (id ? (ws.stores.find((s) => s.id === id)?.name ?? "—") : "Genel");

  return (
    <>
      <PageHeader
        eyebrow="Giderler"
        title="İşletme giderleri"
        description="Kategori, kârlılık tablosunda hangi satıra yazılacağını belirler. Mağaza seçilmezse gider 'Genel' sayılır."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> Gider ekle
          </Button>
        }
      />
      <FilterBar stores={ws.stores} />

      {ws.expenses.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title="Henüz gider kaydı yok"
          description="Reklam harcamaları, kargo faturaları, paketleme, personel, yazılım ve kira gibi giderlerinizi ekleyin."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus /> İlk gideri ekle
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border bg-primary p-4 text-primary-foreground shadow-card">
              <div className="text-xs opacity-80">Toplam ({expenses.length} kayıt)</div>
              <div className="num mt-1 text-lg font-semibold">
                <Money value={total} />
              </div>
            </div>
            {totals.map((t) => (
              <div key={t.value} className="rounded-xl border bg-card p-4 shadow-card">
                <div className="text-xs text-muted-foreground">{t.label}</div>
                <div className="mt-1 text-lg font-semibold">
                  <Money value={t.total} />
                </div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Açıklama</TableHead>
                  <TableHead>Mağaza</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead>Kaynak</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      Bu filtrede gider yok.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(e.date)}</TableCell>
                      <TableCell className="text-sm font-medium">{expenseCategoryLabel(e.category)}</TableCell>
                      <TableCell className="max-w-64 text-sm">
                        <span className="line-clamp-1">{e.description}</span>
                      </TableCell>
                      <TableCell className="text-sm">{storeName(e.storeId)}</TableCell>
                      <TableCell className="text-right">
                        <Money value={e.amount} />
                      </TableCell>
                      <TableCell>
                        <SourceBadge source={e.source} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" aria-label="Düzenle" onClick={() => setEditing(e)}>
                            <Pencil />
                          </Button>
                          <ConfirmDelete
                            trigger={
                              <Button variant="ghost" size="icon" aria-label="Sil">
                                <Trash2 />
                              </Button>
                            }
                            title="Gider silinsin mi?"
                            description={`"${e.description}" gideri silinecek.`}
                            onConfirm={() => {
                              deleteExpense(ws.tenantId, e.id);
                              toast.success("Gider silindi");
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
        </>
      )}

      <ExpenseDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        editing={editing}
        onClose={() => setEditing(null)}
        tenantId={ws.tenantId}
        stores={ws.stores}
      />
    </>
  );
}

function ExpenseDialog({
  editing,
  onClose,
  tenantId,
  stores,
}: {
  editing: Expense | null | "new";
  onClose: () => void;
  tenantId: string;
  stores: Store[];
}) {
  const e0 = editing && editing !== "new" ? editing : null;
  const [category, setCategory] = useState<string>(e0?.category ?? "");
  const [storeId, setStoreId] = useState<string>(e0?.storeId ?? "general");
  const [errors, setErrors] = useState<FieldErrors>({});
  const hint = EXPENSE_CATEGORIES.find((c) => c.value === category)?.hint;

  function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const parsed = expenseSchema.safeParse({
      storeId: storeId === "general" ? null : storeId,
      date: fd.get("date"),
      category,
      amount: fd.get("amount"),
      description: fd.get("description"),
    });
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    try {
      upsertExpense(tenantId, parsed.data, e0?.id);
      toast.success(e0 ? "Gider güncellendi" : "Gider eklendi");
      onClose();
    } catch (err) {
      setErrors({ _form: (err as Error).message });
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{e0 ? "Gideri düzenle" : "Gider ekle"}</DialogTitle>
          <DialogDescription>Elle girilen giderler "Manuel" olarak işaretlenir.</DialogDescription>
        </DialogHeader>
        {errors._form && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errors._form}</p>
        )}
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Kategori" htmlFor="ex-cat" error={errors.category} hint={hint}>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="ex-cat">
                <SelectValue placeholder="Kategori seçin" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mağaza" htmlFor="ex-store" error={errors.storeId}>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger id="ex-store">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">Genel (tüm mağazalar)</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tarih" htmlFor="ex-date" error={errors.date}>
            <Input id="ex-date" name="date" type="date" defaultValue={e0?.date ?? todayISO()} />
          </Field>
          <Field label="Tutar (₺)" htmlFor="ex-amount" error={errors.amount}>
            <Input
              id="ex-amount"
              name="amount"
              inputMode="decimal"
              placeholder="0,00"
              className="num"
              defaultValue={e0 ? String(e0.amount).replace(".", ",") : ""}
            />
          </Field>
          <Field label="Açıklama" htmlFor="ex-desc" error={errors.description} className="sm:col-span-2">
            <Input id="ex-desc" name="description" defaultValue={e0?.description} placeholder="Örn. Kasım reklam bütçesi" />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit">{e0 ? "Kaydet" : "Ekle"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
