import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  CircleDashed,
  CloudUpload,
  Database,
  Download,
  KeyRound,
  Loader2,
  PlugZap,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDelete } from "@/components/app/ConfirmDelete";
import { Field, PageHeader, Panel } from "@/components/app/ui-bits";
import { useWorkspace } from "@/lib/data/hooks";
import { importLocalWorkspaceToSupabase, type CloudImportResult } from "@/lib/data/cloud-import";
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
  { icon: Database, t: "Bulut veritabanı", v: "Supabase hazır · aktarım bekliyor", tone: "warning" as const },
  { icon: ShieldAlert, t: "Oturum / kimlik doğrulama", v: "Supabase Auth", tone: "success" as const },
  { icon: PlugZap, t: "Trendyol API", v: "Henüz bağlanmadı", tone: "neutral" as const },
  { icon: KeyRound, t: "Şifreli anahtar deposu", v: "Veritabanı hazır · API akışı bekliyor", tone: "warning" as const },
  { icon: Users, t: "Çalışma alanı ve roller", v: "Supabase organizasyon yapısı hazır", tone: "success" as const },
  { icon: Sparkles, t: "Ücretli servis / AI / eklenti", v: "Kapalı", tone: "success" as const },
];

function Settings() {
  const ws = useWorkspace();
  const [errors, setErrors] = useState<Partial<Record<"name" | "companyName", string>>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<CloudImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const localCounts = {
    stores: ws.stores.length,
    products: ws.products.length,
    orders: ws.orders.length,
    expenses: ws.expenses.length,
    reconciliations: ws.reconciliations.length,
  };
  const totalLocal = Object.values(localCounts).reduce((sum, count) => sum + count, 0);

  useEffect(() => {
    if (!ws.tenantId || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("sbc:v1:cloud-import:" + ws.tenantId);
      setImportResult(raw ? (JSON.parse(raw) as CloudImportResult) : null);
    } catch {
      setImportResult(null);
    }
  }, [ws.tenantId]);

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
    toast.success("Bu tarayıcıdaki profil bilgileri güncellendi");
  }

  async function importToCloud() {
    setIsImporting(true);
    setImportError(null);
    try {
      const result = await importLocalWorkspaceToSupabase();
      setImportResult(result);
      toast.success("İşletme kayıtları Supabase'e aktarıldı");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Aktarım sırasında bilinmeyen bir hata oluştu.";
      setImportError(message);
      toast.error("Aktarım tamamlanamadı");
    } finally {
      setIsImporting(false);
    }
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
            <Field label="E-posta" htmlFor="st-email" hint="Oturum ve e-posta doğrulaması Supabase üzerinden yapılır.">
              <Input id="st-email" value={ws.user?.email ?? ""} disabled readOnly />
            </Field>
            <Field label="Çalışma alanı adı" htmlFor="st-company" error={errors.companyName}>
              <Input id="st-company" name="companyName" defaultValue={ws.tenant?.name} />
            </Field>
            <Button type="submit">Kaydet</Button>
            <p className="text-xs text-muted-foreground">
              Bu ekrandaki ad ve çalışma alanı adı şimdilik bu tarayıcının profil önbelleğini günceller.
            </p>
          </form>
        </Panel>

        <Panel title="Altyapı durumu" description="Bağlantı ve hazır olan bileşenlerin mevcut durumu.">
          <ul className="space-y-3">
            {STATUS.map((s) => (
              <li key={s.t} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <s.icon className="size-4 text-muted-foreground" /> {s.t}
                </span>
                <Badge variant={s.tone} className="gap-1">
                  {s.tone === "neutral" && <CircleDashed className="size-3" />}
                  {s.tone === "success" && <CheckCircle2 className="size-3" />}
                  {s.v}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Giriş sistemi artık Supabase Auth kullanır. Eski mağaza ve işletme kayıtları bu tarayıcıda korunur;
            aşağıdaki aktarımı tamamlayana kadar başka cihazlarda görünmez.
          </p>
        </Panel>

        <Panel
          title="İşletme verilerini buluta aktar"
          description="Bu tarayıcıdaki mağaza, ürün, sipariş, gider ve mutabakat kayıtlarını Supabase hesabınıza kopyalar."
          className="lg:col-span-2"
        >
          <div className="grid gap-3 sm:grid-cols-5">
            {[
              ["Mağaza", localCounts.stores],
              ["Ürün", localCounts.products],
              ["Sipariş", localCounts.orders],
              ["Gider", localCounts.expenses],
              ["Mutabakat", localCounts.reconciliations],
            ].map(([label, count]) => (
              <div key={label} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{count}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => void importToCloud()} disabled={isImporting || totalLocal === 0}>
              {isImporting ? <Loader2 className="animate-spin" /> : <CloudUpload />}
              {isImporting ? "Buluta aktarılıyor…" : "Yerel verileri buluta aktar"}
            </Button>
            <Button variant="outline" onClick={download}>
              <Download /> Önce yedek indir (JSON)
            </Button>
            <span className="text-xs text-muted-foreground">
              {totalLocal === 0 ? "Aktarılacak yerel kayıt bulunamadı." : `${totalLocal} kayıt aktarılmaya hazır.`}
            </span>
          </div>

          {importError && (
            <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              {importError}
            </p>
          )}

          {importResult && (
            <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
              <p className="font-medium text-success">Son başarılı aktarım</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(importResult.importedAt).toLocaleString("tr-TR")} · {importResult.stores} mağaza · {importResult.products} ürün · {importResult.orders} sipariş · {importResult.expenses} gider · {importResult.reconciliations} mutabakat
              </p>
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Aktarım sırasında kaynak kayıtlar silinmez. Aktarım yarıda kesilirse aynı düğmeye tekrar basılabilir;
            aynı kayıt kimlikleri kullanıldığı için yeniden deneme çoğaltma yapmaz. Aktarım yalnızca bu tarayıcıda
            bulunan mevcut kayıtları kopyalar; bundan sonraki canlı veri eşitlemesi ayrı bir geliştirme adımıdır.
          </p>
        </Panel>

        <Panel title="Yedek ve veri yönetimi" className="lg:col-span-2">
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
              description="Mağazalar, ürünler, sipariş kayıtları, giderler ve mutabakatlar bu tarayıcıdan kalıcı olarak silinir. Buluta aktarılmış kayıtlar ayrıca kalır. Hesabınız korunur."
              confirmLabel="Hepsini sil"
              onConfirm={() => {
                wipeTenantData(ws.tenantId);
                toast.success("Bu tarayıcıdaki iş verileri silindi");
              }}
            />
          </div>
        </Panel>
      </div>
    </>
  );
}
