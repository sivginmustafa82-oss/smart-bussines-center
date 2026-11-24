import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CircleDashed, Lock, PenLine, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/app/BrandMark";
import { currentSession } from "@/lib/data/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Bussines Center — Pazaryeri kârlılık analizi" },
      {
        name: "description",
        content:
          "Trendyol satıcıları için şeffaf kârlılık hesabı: satış, iade, komisyon, kargo, reklam ve ürün maliyetini tek tabloda görün.",
      },
      { property: "og:title", content: "Smart Bussines Center — Pazaryeri kârlılık analizi" },
      {
        property: "og:description",
        content: "Pazaryeri satışlarınızın gerçek kârını kalem kalem görün. Trendyol ile başlıyoruz.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const STATEMENT = [
  { label: "Brüt satış", sign: "" },
  { label: "İptaller", sign: "−" },
  { label: "İadeler", sign: "−" },
  { label: "İndirim ve kuponlar", sign: "−" },
  { label: "Pazaryeri komisyonu", sign: "−" },
  { label: "Kargo", sign: "−" },
  { label: "Reklam", sign: "−" },
  { label: "Stopaj / vergiler", sign: "−" },
  { label: "Ürün maliyeti", sign: "−" },
  { label: "Diğer giderler", sign: "−" },
];

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(!!currentSession()), []);

  return (
    <div className="min-h-screen bg-background bg-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-display text-lg font-bold">Smart Bussines Center</span>
        </div>
        <Button asChild variant="outline">
          <Link to={signedIn ? "/magaza-ozeti" : "/giris"}>{signedIn ? "Panele git" : "Giriş yap"}</Link>
        </Button>
      </header>

      <main className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-16">
        <section className="animate-rise">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-accent" /> Trendyol ile başlıyoruz · diğer pazaryerleri yolda
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
            Satışınız değil,
            <br />
            <span className="text-primary">gerçek kârınız.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            İadeler, komisyonlar, kargo, reklam ve ürün maliyetleri düşüldükten sonra elinizde ne kaldığını
            kalem kalem görün. Hesap formülü her zaman açık.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="hero">
              <Link to={signedIn ? "/magaza-ozeti" : "/giris"}>
                {signedIn ? "Panele git" : "Ücretsiz hesap oluştur"} <ArrowRight />
              </Link>
            </Button>
          </div>

          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { icon: PenLine, t: "Manuel veri girişi", d: "Ürün maliyeti, sipariş, iade ve giderleri kendiniz girin." },
              { icon: Scale, t: "Mutabakat", d: "Pazaryeri raporuyla uygulama toplamlarını karşılaştırın." },
              { icon: Lock, t: "Güvenli tasarım", d: "API anahtarları hiçbir zaman tarayıcıya gönderilmez." },
            ].map((f) => (
              <li key={f.t} className="rounded-xl border bg-card/70 p-4">
                <f.icon className="mb-2 size-5 text-primary" />
                <div className="text-sm font-semibold">{f.t}</div>
                <div className="mt-1 text-xs text-muted-foreground">{f.d}</div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="animate-rise rounded-2xl border bg-card p-6 shadow-card [animation-delay:120ms]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Kârlılık formülü
            </h2>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CircleDashed className="size-3" /> verileriniz burada hesaplanır
            </span>
          </div>
          <ol className="ledger-lines">
            {STATEMENT.map((row) => (
              <li key={row.label} className="flex h-8 items-center justify-between text-sm">
                <span>
                  <span className="num mr-2 inline-block w-3 text-muted-foreground">{row.sign}</span>
                  {row.label}
                </span>
                <span className="num text-muted-foreground">₺ ···</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground">
            <span className="font-semibold">= Net kâr</span>
            <span className="num">₺ ···</span>
          </div>
        </aside>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Smart Bussines Center · Trendyol, ilgili markanın tescilli markasıdır; bu uygulama Trendyol ile resmi
        olarak bağlantılı değildir.
      </footer>
    </div>
  );
}
