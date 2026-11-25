import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandMark } from "@/components/app/BrandMark";
import { Field } from "@/components/app/ui-bits";
import { restoreSession, signIn, signUp } from "@/lib/data/auth";
import { signInSchema, signUpSchema, toFieldErrors, type FieldErrors } from "@/lib/domain/schemas";

export const Route = createFileRoute("/giris")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Giriş yap — Smart Bussines Center" },
      { name: "description", content: "Smart Bussines Center hesabınıza giriş yapın veya yeni hesap oluşturun." },
      { property: "og:title", content: "Giriş yap — Smart Bussines Center" },
      { property: "og:description", content: "Pazaryeri kârlılık panelinize giriş yapın." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

/** Only same-origin relative paths are allowed as post-login destinations. */
function safeRedirect(r?: string) {
  if (!r) return null;
  try {
    const url = new URL(r, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [tab, setTab] = useState("signin");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const go = () => {
    const target = safeRedirect(redirect);
    if (target && target !== "/giris") navigate({ href: target, replace: true });
    else navigate({ to: "/magaza-ozeti", replace: true });
  };

  useEffect(() => {
    let active = true;
    void restoreSession()
      .then((session) => {
        if (active && session) go();
      })
      .catch((err) => {
        if (active) setErrors({ _form: (err as Error).message });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = signInSchema.safeParse(fd);
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      await signIn(parsed.data);
      go();
    } catch (err) {
      setErrors({ _form: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = signUpSchema.safeParse(fd);
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      const result = await signUp(parsed.data);
      if (result.confirmationRequired || !result.session) {
        setTab("signin");
        setErrors({
          _form: "Hesabınız oluşturuldu. Giriş yapmadan önce e-posta adresinize gelen doğrulama bağlantısına tıklayın.",
        });
        toast.info("E-posta doğrulaması bekleniyor");
        return;
      }
      toast.success("Hesabınız güvenli şekilde oluşturuldu");
      navigate({ to: "/magaza-ozeti", replace: true });
    } catch (err) {
      setErrors({ _form: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-hero px-4 py-10">
      <div className="w-full max-w-md animate-rise">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <BrandMark />
          <span className="font-display text-lg font-bold">Smart Bussines Center</span>
        </Link>
        <div className="rounded-2xl border bg-card p-6 shadow-card">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v);
              setErrors({});
            }}
          >
            <TabsList className="mb-5 grid w-full grid-cols-2">
              <TabsTrigger value="signin">Giriş yap</TabsTrigger>
              <TabsTrigger value="signup">Hesap oluştur</TabsTrigger>
            </TabsList>

            {errors._form && (
              <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {errors._form}
              </p>
            )}

            <TabsContent value="signin">
              <form onSubmit={onSignIn} className="space-y-4" noValidate>
                <Field label="E-posta" htmlFor="si-email" error={errors.email}>
                  <Input id="si-email" name="email" type="email" autoComplete="email" />
                </Field>
                <Field label="Şifre" htmlFor="si-password" error={errors.password}>
                  <Input id="si-password" name="password" type="password" autoComplete="current-password" />
                </Field>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />} Giriş yap
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={onSignUp} className="space-y-4" noValidate>
                <Field label="Ad soyad" htmlFor="su-name" error={errors.name}>
                  <Input id="su-name" name="name" autoComplete="name" />
                </Field>
                <Field
                  label="Şirket / çalışma alanı adı"
                  htmlFor="su-company"
                  error={errors.companyName}
                  hint="Mağazalarınız bu çalışma alanına bağlanır."
                >
                  <Input id="su-company" name="companyName" autoComplete="organization" />
                </Field>
                <Field label="E-posta" htmlFor="su-email" error={errors.email}>
                  <Input id="su-email" name="email" type="email" autoComplete="email" />
                </Field>
                <Field
                  label="Şifre"
                  htmlFor="su-password"
                  error={errors.password}
                  hint="En az 8 karakter, bir harf ve bir rakam."
                >
                  <Input id="su-password" name="password" type="password" autoComplete="new-password" />
                </Field>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />} Hesap oluştur
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
          Hesap ve oturum Supabase üzerinden güvenli şekilde doğrulanır. Önceden bu tarayıcıya kaydedilmiş
          işletme kayıtlarınız korunur; buluta aktarım ayrı bir adımda yapılır.
        </p>
      </div>
    </div>
  );
}
