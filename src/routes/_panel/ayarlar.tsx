import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
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
  Upload,
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
import { type CloudImportResult } from "@/lib/data/cloud-import";
import { syncWorkspaceWithCloud, type CloudSyncResult } from "@/lib/data/cloud-sync";
import { importTenantBackupFile } from "@/lib/data/legacy-backup";
import { exportTenantData, renameTenant, renameUser, wipeTenantData } from "@/lib/data/repo";
import { supabase } from "@/integrations/supabase/client";
import type { Store } from "@/lib/domain/types";

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
  const [isRestoring, setIsRestoring] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<CloudImportResult | null>(null);
  const [syncResult, setSyncResult] = useState<CloudSyncResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const localCounts = {
    stores: ws.stores.length,
    products: ws.products.length,
    orders: ws.orders.length,
    expenses: ws.expenses.length,
    reconciliations: ws.reconciliations.length,
  };
  const totalLocal = Object.values(localCounts).reduce((sum, count) => sum + count, 0);
  const statusItems = STATUS.map((item) => {
    if (item.t === "Bulut veritabanı") {
      return { ...item, v: importResult ? "Yerel kayıtlar aktarıldı" : "Supabase hazır · aktarım bekliyor", tone: importResult ? ("success" as const) : ("warning" as const) };
    }
    if (item.t === "Trendyol API") {
      const connected = ws.stores.some((store) => store.marketplace === "trendyol" && store.connectionStatus === "connected");
      return { ...item, v: connected ? "Bağlı · API bilgileri şifreli saklanıyor" : "Henüz bağlanmadı", tone: connected ? ("success" as const) : ("neutral" as const) };
    }
    if (item.t === "Şifreli anahtar deposu") {
      const connected = ws.stores.some((store) => store.marketplace === "trendyol" && store.connectionStatus === "connected");
      return { ...item, v: connected ? "Hazır · API bilgileri şifreli" : "Veritabanı hazır · API akışı bekliyor", tone: connected ? ("success" as const) : ("warning" as const) };
    }
    return item;
  });

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

  async function changeAccountPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    if (!ws.user?.email) {
      setPasswordError("Oturum e-posta adresi bulunamadı. Yeniden giriş yapın.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Yeni şifre en az 8 karakter olmalıdır.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Yeni şifre ve tekrarı aynı değil.");
      return;
    }
    setIsChangingPassword(true);
    try {
      // Re-authenticate before changing the credential.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: ws.user.email,
        password: currentPassword,
      });
      if (signInError) throw new Error("Mevcut şifre doğrulanamadı. Şifrenizi kontrol edin.");
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Hesap şifreniz başarıyla güncellendi.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Şifre güncellenemedi.";
      setPasswordError(message);
      toast.error("Şifre güncellenemedi");
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsRestoring(true);
    setImportError(null);
    try {
      const result = await importTenantBackupFile(file);
      setImportResult(null);
      toast.success(`Yedek yüklendi: ${result.stores} mağaza, ${result.products} ürün, ${result.orders} sipariş, ${result.expenses} gider, ${result.reconciliations} mutabakat`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Yedek yüklenemedi.";
      setImportError(message);
      toast.error("JSON yedeği yüklenemedi");
    } finally {
      setIsRestoring(false);
      event.target.value = "";
    }
  }

  async function syncCloud() {
    setIsImporting(true);
    setImportError(null);
    try {
      const result = await syncWorkspaceWithCloud();
      setSyncResult(result);
      setImportResult({ ...result, importedAt: result.syncedAt });
      toast.success("Bulut ve bu cihaz başarıyla eşitlendi");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Aktarım sırasında bilinmeyen bir hata oluştu.";
      setImportError(message);
      toast.error("Bulut eşitlemesi tamamlanamadı");
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

        <Panel title="Hesap ve şifre güvenliği" description="Giriş bilgilerinizi görüntüleyin ve hesabınızın şifresini güvenli şekilde değiştirin.">
          <div className="space-y-4">
            <div>
              <Button type="button" variant="outline" onClick={() => setShowAccountDetails((value) => !value)}>
                {showAccountDetails ? "Hesap bilgilerini gizle" : "Mevcut kullanıcı bilgilerini göster"}
              </Button>
              {showAccountDetails && (
                <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm">
                  <p><span className="text-muted-foreground">Kullanıcı adı:</span> {ws.user?.name || "Tanımlanmamış"}</p>
                  <p className="mt-1"><span className="text-muted-foreground">Giriş e-postası:</span> {ws.user?.email || "Bulunamadı"}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Mevcut şifre güvenlik nedeniyle görüntülenemez. Yalnızca yeni şifre belirleyebilirsiniz.</p>
                </div>
              )}
            </div>
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold">Şifreyi güncelle</h3>
              <form onSubmit={(event) => void changeAccountPassword(event)} className="mt-3 grid gap-3 md:max-w-xl" noValidate>
                <Field label="Mevcut şifre" htmlFor="account-current-password">
                  <Input id="account-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
                </Field>
                <Field label="Yeni şifre" htmlFor="account-new-password" hint="En az 8 karakter kullanın.">
                  <Input id="account-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} />
                </Field>
                <Field label="Yeni şifre (tekrar)" htmlFor="account-confirm-password">
                  <Input id="account-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} />
                </Field>
                <div>
                  <Button type="submit" disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}>
                    {isChangingPassword ? <Loader2 className="animate-spin" /> : <KeyRound />}
                    {isChangingPassword ? "Şifre güncelleniyor…" : "Şifreyi güncelle"}
                  </Button>
                </div>
                {passwordError && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{passwordError}</p>}
              </form>
            </div>
          </div>
        </Panel>

        <Panel title="Altyapı durumu" description="Bağlantı ve hazır olan bileşenlerin mevcut durumu.">
          <ul className="space-y-3">
            {statusItems.map((s) => (
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

        <TrendyolConnectionPanel stores={ws.stores} tenantId={ws.tenantId} />

        <Panel
          title="Bulut eşitleme"
          description="Buluttaki kayıtları bu cihaza alır, bu cihazdaki yeni kayıtları da buluta gönderir. Hiçbir kayıt otomatik silinmez."
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
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => void restoreBackup(event)}
              aria-label="Eski uygulamadan alınmış JSON yedeği seç"
            />
            <Button variant="outline" onClick={() => backupInputRef.current?.click()} disabled={isRestoring || isImporting}>
              {isRestoring ? <Loader2 className="animate-spin" /> : <Upload />}
              {isRestoring ? "Yedek okunuyor…" : "Eski uygulama JSON yedeğini yükle"}
            </Button>
            <Button onClick={() => void syncCloud()} disabled={isImporting || isRestoring}>
              {isImporting ? <Loader2 className="animate-spin" /> : <CloudUpload />}
              {isImporting ? "Eşitleniyor…" : "Şimdi bulutla eşitle"}
            </Button>
            <Button variant="outline" onClick={download}>
              <Download /> Önce yedek indir (JSON)
            </Button>
            <span className="text-xs text-muted-foreground">
              {totalLocal === 0 ? "Bu cihazda yerel kayıt yok; buluttaki kayıtları indirmek için eşitlemeyi başlatabilirsiniz." : `${totalLocal} kayıt eşitlemeye hazır.`}
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
            Eski Lovable adresindeki kaydı taşımak için önce eski uygulamada Ayarlar → Verileri indir (JSON) ile yedek alın;
            sonra bu ekranda “Eski uygulama JSON yedeğini yükle” düğmesini kullanın. Yükleme, kayıtları mevcut çalışma alanınıza
            ekler ve mağaza/ürün bağlantılarını korur. Ardından “Yerel verileri buluta aktar” düğmesine basın.
            Eşitleme sırasında kaynak kayıtlar silinmez. İşlem yarıda kesilirse tekrar çalıştırabilirsiniz; sabit kayıt kimlikleri yinelenen kayıt oluşmasını önler. Bulut ve cihaz kayıtları birleştirilir. Bu cihazda henüz buluta gönderilmemiş ürün düzenlemeleri eski bulut kopyasının üzerine yazılmadan korunur ve buluta aktarılır; önemli değişikliklerden sonra eşitlemenin tamamlandığını kontrol edin.
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


function TrendyolConnectionPanel({ stores, tenantId }: { stores: Store[]; tenantId: string }) {
  const trendyolStores = stores.filter((store) => store.marketplace === "trendyol");
  const selectedStore = trendyolStores.find((store) => store.connectionStatus === "connected") ?? trendyolStores[0];
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncingProducts, setIsSyncingProducts] = useState(false);
  const [productSyncError, setProductSyncError] = useState<string | null>(null);
  const [productSyncResult, setProductSyncResult] = useState<{products_received:number;variants_received:number;matched_order_lines:number} | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    setError(null);

    const store = trendyolStores.find((item) => item.id === (selectedStoreId || selectedStore?.id));
    if (!store) {
      setError("Önce bir Trendyol mağazası oluşturun.");
      return;
    }
    if (!/^\d{3,20}$/.test(supplierId.trim())) {
      setError("Satıcı ID / Supplier ID yalnızca rakamlardan oluşmalıdır.");
      return;
    }
    if (!apiKey.trim() || !apiSecret.trim()) {
      setError("API Key ve API Secret alanlarını doldurun.");
      return;
    }

    let cloudStoreId = store.id;
    try {
      const mapRaw = window.localStorage.getItem("sbc:v1:cloud-id-map:" + tenantId);
      const map = mapRaw ? (JSON.parse(mapRaw) as Record<string, string>) : {};
      cloudStoreId = map["store:" + store.id] || store.id;
    } catch {
      setError("Mağaza bulut eşlemesi okunamadı. Önce bulut eşitlemesini çalıştırın.");
      return;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cloudStoreId)) {
      setError("Mağaza henüz buluta aktarılmamış. Önce “Şimdi bulutla eşitle” düğmesine basın.");
      return;
    }

    setIsConnecting(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error("Oturum süreniz dolmuş. Yeniden giriş yapın.");
      }

      const { data, error: functionError } = await supabase.functions.invoke("smart-business-api", {
        body: {
          action: "connect_trendyol",
          store_id: cloudStoreId,
          supplier_id: supplierId.trim(),
          api_key: apiKey.trim(),
          api_secret: apiSecret.trim(),
        },
        headers: { Authorization: "Bearer " + sessionData.session.access_token },
      });

      if (functionError) throw new Error(functionError.message);
      if (!data?.ok) throw new Error(data?.error || "Trendyol bağlantısı doğrulanamadı.");

      setSuccess(
        "Bağlantı doğrulandı ve API bilgileri şifrelenerek kaydedildi. Test sorgusunda " +
          String(data.sample_packages ?? 0) +
          " paket bulundu.",
      );
      setApiKey("");
      setApiSecret("");
      toast.success("Trendyol bağlantısı başarıyla kaydedildi");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Trendyol bağlantısı kurulamadı.";
      setError(message);
      toast.error("Trendyol bağlantısı kurulamadı");
    } finally {
      setIsConnecting(false);
    }
  }

  async function syncProducts() {
    setProductSyncError(null);
    setProductSyncResult(null);
    const store = trendyolStores.find((item) => item.id === (selectedStoreId || selectedStore?.id));
    if (!store) { setProductSyncError("Aktarılacak Trendyol mağazası seçilemedi."); return; }
    let cloudStoreId = store.id;
    try {
      const raw = window.localStorage.getItem("sbc:v1:cloud-id-map:" + tenantId);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      cloudStoreId = map["store:" + store.id] || store.id;
    } catch { setProductSyncError("Mağaza bulut eşlemesi okunamadı."); return; }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cloudStoreId)) {
      setProductSyncError("Mağaza henüz buluta aktarılmamış. Önce bulut eşitlemesini çalıştırın."); return;
    }
    setIsSyncingProducts(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error("Oturum süreniz dolmuş. Yeniden giriş yapın.");
      const { data, error: functionError } = await supabase.functions.invoke("smart-business-api", {
        body: { action: "sync_trendyol_products", store_id: cloudStoreId },
        headers: { Authorization: "Bearer " + sessionData.session.access_token },
      });
      if (functionError) throw new Error(functionError.message);
      if (!data?.ok) throw new Error(data?.error || "Ürün aktarımı tamamlanamadı.");
      await syncWorkspaceWithCloud();
      setProductSyncResult(data);
      toast.success("Trendyol ürünleri aktarıldı ve siparişler eşleştirildi");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Ürün aktarımı sırasında hata oluştu.";
      setProductSyncError(message);
      toast.error("Trendyol ürün aktarımı başarısız");
    } finally { setIsSyncingProducts(false); }
  }

  return (
    <Panel
      title="Trendyol API bağlantısı"
      description="API bilgileri önce Trendyol Order V2 servisiyle test edilir. Başarılıysa sunucu tarafında şifrelenerek saklanır; tarayıcıya veya yerel kayıtlara yazılmaz."
      className="lg:col-span-2"
    >
      {trendyolStores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Henüz Trendyol mağazası yok. Önce Mağazalar bölümünden Trendyol mağazanızı ekleyin.
        </p>
      ) : (
        <form onSubmit={(event) => void connect(event)} className="grid gap-4 md:grid-cols-2" noValidate>
          <Field label="Trendyol mağazası" htmlFor="ty-store">
            <select
              id="ty-store"
              value={selectedStoreId || selectedStore?.id || ""}
              onChange={(event) => setSelectedStoreId(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {trendyolStores.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Satıcı ID / Supplier ID" htmlFor="ty-supplier-id" hint="Trendyol Satıcı Paneli → Hesap Bilgilerim → Entegrasyon Bilgileri">
            <Input
              id="ty-supplier-id"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Örn. 123456"
            />
          </Field>
          <Field label="API Key" htmlFor="ty-api-key">
            <Input
              id="ty-api-key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="Trendyol API Key"
            />
          </Field>
          <Field label="API Secret" htmlFor="ty-api-secret">
            <Input
              id="ty-api-secret"
              type="password"
              value={apiSecret}
              onChange={(event) => setApiSecret(event.target.value)}
              autoComplete="new-password"
              placeholder="Trendyol API Secret"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={isConnecting}>
              {isConnecting ? <Loader2 className="animate-spin" /> : <PlugZap />}
              {isConnecting ? "Bağlantı test ediliyor…" : "Bağlantıyı test et ve güvenli kaydet"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Bilgiler yalnızca bu işlem sırasında gönderilir; API Secret ekranda tekrar gösterilmez.
            </span>
          </div>
          {error && (
            <p className="md:col-span-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="md:col-span-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success" role="status">
              {success}
            </p>
          )}
          <div className="md:col-span-2 flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="button" variant="outline" disabled={isSyncingProducts || isConnecting} onClick={() => void syncProducts()}>
              {isSyncingProducts ? <Loader2 className="animate-spin" /> : <Download />}
              {isSyncingProducts ? "Ürün kataloğu aktarılıyor…" : "Trendyol ürünlerini ve barkodlarını aktar"}
            </Button>
            {productSyncError && <p className="md:col-span-2 text-sm text-destructive" role="alert">{productSyncError}</p>}
            {productSyncResult && (
              <p className="md:col-span-2 text-sm text-success" role="status">
                {productSyncResult.products_received} ürün, {productSyncResult.variants_received} barkod/varyant aktarıldı.
                {" "}{productSyncResult.matched_order_lines} eski sipariş satırı ürünlerle eşleştirildi.
              </p>
            )}
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3 md:col-span-2" role="status">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Otomatik sipariş aktarımı açık</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Trendyol siparişleri, iptaller ve onaylı iadeler sunucu tarafından her saat otomatik alınır.
                  Her aktarım son 3 günü İstanbul saatiyle yeniden kontrol eder; böylece geç güncellenen durumlar da yakalanır.
                  Bilgisayarınızın veya telefonunuzun açık kalması gerekmez. Manuel sipariş aktarımı yapmanız gerekmez.
                </p>
              </div>
            </div>
          </div>
          {syncResult && (
            <p className="md:col-span-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success" role="status">
              {syncResult.start_date && syncResult.end_date && (
                <>Aralık: {syncResult.query_start ?? syncResult.start_date} – {syncResult.query_end ?? syncResult.end_date}. </>
              )}
              {syncResult.packages_received} paket incelendi; {syncResult.lines_imported} sipariş satırı aktarıldı.
              {" "}Satış: {syncResult.sale_lines}, iptal: {syncResult.cancellation_lines}, onaylı iade: {syncResult.return_lines} kalem ({(syncResult.return_gross_amount ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL).
              {" "}İadeye bağlı eşleşen indirim: {(syncResult.return_discount_matched ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL; eşleşmeyen iade kalemi: {syncResult.return_discount_unmatched_lines ?? 0}.
              {" "}Ürün eşleşmesi: {syncResult.matched_products}; eşleşmeyen: {syncResult.unmatched_products}.
            </p>
          )}
        </form>
      )}
    </Panel>
  );
}
