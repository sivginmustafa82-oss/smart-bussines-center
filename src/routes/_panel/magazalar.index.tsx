import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowRight, Plus, Store } from "lucide-react";
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
import { EmptyState, Field, NotConnectedBadge, PageHeader } from "@/components/app/ui-bits";
import { useWorkspace } from "@/lib/data/hooks";
import { createStore } from "@/lib/data/repo";
import { MARKETPLACES, marketplaceLabel } from "@/lib/domain/labels";
import { storeSchema, toFieldErrors, type FieldErrors } from "@/lib/domain/schemas";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_panel/magazalar/")({
  head: () => ({
    meta: [
      { title: "Mağazalar — Smart Bussines Center" },
      { name: "description", content: "Pazaryeri mağazalarınızı ekleyin ve bağlantı durumlarını görün." },
      { property: "og:title", content: "Mağazalar — Smart Bussines Center" },
      { property: "og:description", content: "Pazaryeri mağazalarınızı yönetin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Stores,
});

function Stores() {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);

  const counts = (id: string) => ({
    products: ws.products.filter((p) => p.storeId === id).length,
    orders: ws.orders.filter((o) => o.storeId === id).length,
  });

  return (
    <>
      <PageHeader
        eyebrow="Mağazalar"
        title="Mağazalarınız"
        description="Her mağaza çalışma alanınıza aittir; ürün, sipariş ve giderler mağaza bazında ayrılır."
        actions={
          ws.stores.length > 0 && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Mağaza ekle
            </Button>
          )
        }
      />

      {ws.stores.length === 0 ? (
        <EmptyState
          icon={<Store />}
          title="Henüz mağaza yok"
          description="İlk Trendyol mağazanızı ekleyin. Bağlantı kurulmadan da verilerinizi manuel olarak girebilirsiniz."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus /> Mağaza ekle
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ws.stores.map((s) => {
            const c = counts(s.id);
            return (
              <Link
                key={s.id}
                to="/magazalar/$storeId"
                params={{ storeId: s.id }}
                className="group rounded-xl border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                      {marketplaceLabel(s.marketplace)}
                    </p>
                    <h3 className="mt-1 truncate text-lg font-semibold">{s.name}</h3>
                  </div>
                  <NotConnectedBadge />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Ürün</dt>
                    <dd className="num font-medium">{c.products}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Sipariş kaydı</dt>
                    <dd className="num font-medium">{c.orders}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Eklendi: {formatDate(s.createdAt)}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    Bağlantı ayarları <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <AddStoreDialog open={open} onOpenChange={setOpen} tenantId={ws.tenantId} />
    </>
  );
}

function AddStoreDialog({
  open,
  onOpenChange,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [marketplace, setMarketplace] = useState("trendyol");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = storeSchema.safeParse({ name: fd.get("name"), marketplace });
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    createStore(tenantId, parsed.data);
    toast.success("Mağaza eklendi");
    setErrors({});
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); setErrors({}); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mağaza ekle</DialogTitle>
          <DialogDescription>Mağaza eklemek pazaryerine bağlanmaz; bağlantı ayrı bir adımdır.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Mağaza adı" htmlFor="store-name" error={errors.name}>
            <Input id="store-name" name="name" placeholder="Örn. Ana mağaza" autoFocus />
          </Field>
          <Field label="Pazaryeri" htmlFor="store-mp" error={errors.marketplace}>
            <Select value={marketplace} onValueChange={setMarketplace}>
              <SelectTrigger id="store-mp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARKETPLACES.map((m) => (
                  <SelectItem key={m.value} value={m.value} disabled={!m.available}>
                    {m.label} {!m.available && "(yakında)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit">Ekle</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
