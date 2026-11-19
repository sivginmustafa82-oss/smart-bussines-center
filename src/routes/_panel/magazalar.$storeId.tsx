import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, Lock, PlugZap, Server, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDelete } from "@/components/app/ConfirmDelete";
import { EmptyState, Field, NotConnectedBadge, PageHeader, Panel } from "@/components/app/ui-bits";
import { useWorkspace } from "@/lib/data/hooks";
import { deleteStore, renameStore } from "@/lib/data/repo";
import { marketplaceLabel } from "@/lib/domain/labels";
import { storeSchema, toFieldErrors, type FieldErrors } from "@/lib/domain/schemas";

export const Route = createFileRoute("/_panel/magazalar/$storeId")({
  head: () => ({
    meta: [
      { title: "Mağaza ve Trendyol bağlantısı — Smart Bussines Center" },
      { name: "description", content: "Mağaza ayarları ve Trendyol API bağlantı durumu." },
      { property: "og:title", content: "Mağaza ayarları — Smart Bussines Center" },
      { property: "og:description", content: "Trendyol bağlantı durumu ve mağaza ayarları." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoreDetail,
});

function StoreDetail() {
  const { storeId } = Route.useParams();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const store = ws.stores.find((s) => s.id === storeId);
  const [errors, setErrors] = useState<FieldErrors>({});

  if (!store) {
    return (
      <EmptyState
        icon={<PlugZap />}
        title="Mağaza bulunamadı"
        description="Bu mağaza silinmiş ya da çalışma alanınıza ait değil."
        action={
          <Button asChild variant="outline">
            <Link to="/magazalar">Mağazalara dön</Link>
          </Button>
        }
      />
    );
  }

  function rename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get("name");
    const parsed = storeSchema.safeParse({ name, marketplace: "trendyol" });
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    renameStore(ws.tenantId, store!.id, parsed.data.name);
    setErrors({});
    toast.success("Mağaza adı güncellendi");
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/magazalar">
          <ArrowLeft /> Mağazalar
        </Link>
      </Button>
      <PageHeader
        eyebrow={marketplaceLabel(store.marketplace)}
        title={store.name}
        actions={<NotConnectedBadge />}
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel
          title="Trendyol API bağlantısı"
          description="Satıcı panelinizdeki Hesap Bilgilerim → Entegrasyon Bilgileri bölümünden alınır."
          actions={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
              <span className="size-1.5 rounded-full bg-muted-foreground" /> Durum: Bağlı değil
            </span>
          }
        >
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-info/30 bg-info/8 p-4 text-sm">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-info" />
            <div className="space-y-1.5">
              <p className="font-semibold">Güvenli, yalnızca sunucu tarafında saklama</p>
              <p className="text-muted-foreground">
                API anahtarı ve API secret hiçbir zaman tarayıcıda saklanmayacak, tarayıcıya geri gönderilmeyecek ve
                ekranda gösterilmeyecek. Bilgiler yalnızca şifreli sunucu deposunda tutulacak ve Trendyol'a yapılan
                istekler sunucu üzerinden gönderilecek.
              </p>
              <p className="text-muted-foreground">
                Bu güvenli sunucu altyapısı henüz etkin olmadığı için alanlar şu an <strong>kilitli</strong>; hiçbir
                bilgi istenmiyor veya kaydedilmiyor.
              </p>
            </div>
          </div>

          <fieldset disabled className="space-y-4 opacity-80" aria-describedby="conn-locked">
            <Field label="Satıcı ID (Supplier ID)" htmlFor="tr-seller" hint="Sayısal satıcı numaranız.">
              <Input id="tr-seller" inputMode="numeric" placeholder="Sunucu bağlantısı etkinleşince girilebilir" autoComplete="off" />
            </Field>
            <Field label="API Key" htmlFor="tr-key">
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="tr-key" className="pl-9" placeholder="••••••••••••" autoComplete="off" />
              </div>
            </Field>
            <Field label="API Secret" htmlFor="tr-secret">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="tr-secret" type="password" className="pl-9" placeholder="••••••••••••" autoComplete="off" />
              </div>
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button">
                <PlugZap /> Bağlantıyı test et
              </Button>
              <span id="conn-locked" className="text-xs text-muted-foreground">
                Yakında — sunucu altyapısı onaylandıktan sonra.
              </span>
            </div>
          </fieldset>

          <div className="mt-6 grid gap-3 rounded-lg bg-muted p-4 text-sm sm:grid-cols-3">
            {[
              { icon: Server, t: "Son eşitleme", v: "Hiç yapılmadı" },
              { icon: PlugZap, t: "Bağlantı testi", v: "Yapılmadı" },
              { icon: ShieldCheck, t: "Kayıtlı kimlik bilgisi", v: "Yok" },
            ].map((x) => (
              <div key={x.t}>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <x.icon className="size-3.5" /> {x.t}
                </div>
                <div className="mt-0.5 font-medium">{x.v}</div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Mağaza bilgileri">
            <form onSubmit={rename} className="space-y-4" noValidate>
              <Field label="Mağaza adı" htmlFor="sd-name" error={errors.name}>
                <Input id="sd-name" name="name" defaultValue={store.name} key={store.name} />
              </Field>
              <Button type="submit" variant="outline">
                Kaydet
              </Button>
            </form>
          </Panel>
          <Panel title="Mağazayı sil">
            <p className="mb-4 text-sm text-muted-foreground">
              Bu mağazaya ait ürünler, sipariş kayıtları, mağaza giderleri ve mutabakatlar kalıcı olarak silinir.
            </p>
            <ConfirmDelete
              trigger={
                <Button variant="destructive">
                  <Trash2 /> Mağazayı sil
                </Button>
              }
              title={`"${store.name}" silinsin mi?`}
              description="Bu işlem geri alınamaz."
              onConfirm={() => {
                deleteStore(ws.tenantId, store.id);
                toast.success("Mağaza silindi");
                navigate({ to: "/magazalar" });
              }}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
