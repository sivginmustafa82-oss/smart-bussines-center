import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { CircleDashed, Database, Download, KeyRound, PlugZap, ShieldAlert, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDelete } from "@/components/app/ConfirmDelete";
import { Field, PageHeader, Panel } from "@/components/app/ui-bits";
import { useWorkspace } from "@/lib/data/hooks";
import { exportTenantData, renameTenant, renameUser, wipeTenantData } from "@/lib/data/repo";

export const Route = createFileRoute("/_panel/ayarlar")({
  head: () => ({
    meta: [
      { title: "Ayarlar — Smart Bussines Center" },
      { name: "description", content: "Profil, çalışma alanı ve altyapı durumu ayarları." },
      { property: "og:title", content: "Ayarlar — Smart Bussines Center" },
      { property: "og:description", content: "Hesap ve çalışma alanı ayarları." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

const nameSchema = z.object({
  name: z.string().trim().min(2, "En az 2 karakter").max(80, "En fazla 80 karakter"),
  companyName: z.string().trim().min(2, "En az 2 karakter").max(100, "En fazla 100 karakter"),
});

const STATUS = [
  { icon: Database, t: "Veri saklama", v: "Yalnızca bu tarayıcı (prototip)", tone: "warning" as const },
  { icon: ShieldAlert, t: "Oturum / kimlik doğrulama", v: "Tarayıcı içi prototip", tone: "warning" as const },
  { icon: PlugZap, t: "Trendyol API", v: "Bağlı değil", tone: "neutral" as const },
  { icon: KeyRound, t: "Sunucu tarafı gizli anahtar deposu", v: "Henüz kurulmadı", tone: "neutral" as const },
  { icon: Users, t: "Ekip üyeleri", v: "Yalnızca hesap sahibi", tone: "neutral" as const },
  { icon: Sparkles, t: "Ücretli servis / AI / eklenti", v: "Kapalı", tone: "success" as const },
];

function Settings() {
  const ws = useWorkspace();
  const [errors, setErrors] = useState<Partial<Record<"name" | "companyName", string>>>({});

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = nameSchema.safeParse({ name: fd.get("name"), companyName: fd.get("companyName") });
    if (!parsed.success) {
      const out: Partial<Record<"name" | "companyName", string>> = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0];
        if ((k === "name" || k === "companyName") && !out[k]) out[k] = i.message;
      }
      return setErrors(out);
    }
    setErrors({});
    if (ws.user) renameUser(ws.user.id, parsed.data.name);
    renameTenant(ws.tenantId, parsed.data.companyName);
    toast.success("Ayarlar kaydedildi");
  }

  function download() {
    const blob = new Blob([JSON.stringify(exportTenantData(ws.tenantId), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smart-bussines-center-veriler.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader eyebrow="Ayarlar" title="Ayarlar" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Profil ve çalışma alanı">
          <form onSubmit={save} className="space-y-4" noValidate key={`${ws.user?.name}-${ws.tenant?.name}`}>
            <Field label="Ad soyad" htmlFor="st-name" error={errors.name}>
              <Input id="st-name" name="name" defaultValue={ws.user?.name} />
            </Field>
            <Field label="E-posta" htmlFor="st-email" hint="E-posta değişikliği sunucu tarafı oturumla gelecek.">
              <Input id="st-email" value={ws.user?.email ?? ""} disabled readOnly />
            </Field>
            <Field label="Çalışma alanı adı" htmlFor="st-company" error={errors.companyName}>
              <Input id="st-company" name="companyName" defaultValue={ws.tenant?.name} />
            </Field>
            <Button type="submit">Kaydet</Button>
          </form>
        </Panel>

        <Panel title="Altyapı durumu" description="Uygulamanın şu anki gerçek durumu.">
          <ul className="space-y-3">
            {STATUS.map((s) => (
              <li key={s.t} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <s.icon className="size-4 text-muted-foreground" /> {s.t}
                </span>
                <Badge variant={s.tone} className="gap-1">
                  {s.tone === "neutral" && <CircleDashed className="size-3" />} {s.v}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Veriler başka cihazda görünmez ve tarayıcı verileri silinirse kaybolur. Kalıcı ve güvenli kullanım için sunucu
            tarafı veritabanı ve oturum, onayınızla etkinleştirilecek.
          </p>
        </Panel>

        <Panel title="Verilerim" className="lg:col-span-2">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={download}>
              <Download /> Verileri indir (JSON)
            </Button>
            <ConfirmDelete
              trigger={
                <Button variant="destructive">
                  <Trash2 /> Tüm iş verilerini sil
                </Button>
              }
              title="Tüm iş verileri silinsin mi?"
              description="Mağazalar, ürünler, sipariş kayıtları, giderler ve mutabakatlar kalıcı olarak silinir. Hesabınız korunur."
              confirmLabel="Hepsini sil"
              onConfirm={() => {
                wipeTenantData(ws.tenantId);
                toast.success("İş verileri silindi");
              }}
            />
          </div>
        </Panel>
      </div>
    </>
  );
}
