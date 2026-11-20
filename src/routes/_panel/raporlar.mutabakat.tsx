import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, MinusCircle, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDelete } from "@/components/app/ConfirmDelete";
import { NeedStore } from "@/components/app/NeedStore";
import { Field, Money, PageHeader, Panel, SourceBadge } from "@/components/app/ui-bits";
import { useWorkspace } from "@/lib/data/hooks";
import { deleteReconciliation, saveReconciliation } from "@/lib/data/repo";
import { calculateProfit, filterRecords, periodRange } from "@/lib/domain/profitability";
import {
  appTotalsForReconciliation,
  compareTotals,
  DEFAULT_TOLERANCE,
  RECON_LABELS,
} from "@/lib/domain/reconciliation";
import { reconciliationSchema, toFieldErrors, type FieldErrors } from "@/lib/domain/schemas";
import type { MarketplaceTotals } from "@/lib/domain/types";
import { currentPeriod, formatPeriod, formatTRY } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_panel/raporlar/mutabakat")({
  head: () => ({
    meta: [
      { title: "Mutabakat — Smart Bussines Center" },
      { name: "description", content: "Pazaryeri hakediş toplamlarını uygulama toplamlarıyla karşılaştırın." },
      { property: "og:title", content: "Mutabakat — Smart Bussines Center" },
      { property: "og:description", content: "Pazaryeri ve uygulama toplamları arasındaki farklar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reconciliation,
});

const KEYS = Object.keys(RECON_LABELS) as (keyof MarketplaceTotals)[];
const toText = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

function Reconciliation() {
  const ws = useWorkspace();
  const [storeId, setStoreId] = useState(ws.stores[0]?.id ?? "");
  const [period, setPeriod] = useState(currentPeriod());
  const [errors, setErrors] = useState<FieldErrors>({});

  const store = ws.stores.find((s) => s.id === storeId);
  const existing = ws.reconciliations.find((r) => r.storeId === storeId && r.period === period);

  const appTotals = useMemo(() => {
    const range = periodRange(period);
    const records = filterRecords(ws.orders, { storeId: storeId || "none", ...range });
    const b = calculateProfit(records, [], ws.products);
    return { totals: appTotalsForReconciliation(b, { shipping: b.shipping, withholding: b.taxes }), count: records.length };
  }, [ws.orders, ws.products, storeId, period]);

  const rows = existing ? compareTotals(appTotals.totals, existing.totals) : null;
  const mismatches = rows?.filter((r) => r.status === "mismatch").length ?? 0;

  if (ws.stores.length === 0)
    return (
      <>
        <PageHeader eyebrow="Raporlar" title="Pazaryeri mutabakatı" />
        <NeedStore what="Mutabakat kayıtları" />
      </>
    );

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = reconciliationSchema.safeParse({ ...fd, storeId, period });
    if (!parsed.success) return setErrors(toFieldErrors(parsed.error));
    const { storeId: sid, period: p, note, ...totals } = parsed.data;
    if (KEYS.every((k) => totals[k] == null)) {
      return setErrors({ _form: "Karşılaştırma için en az bir pazaryeri toplamı girin" });
    }
    setErrors({});
    saveReconciliation(ws.tenantId, { storeId: sid, period: p, totals, note });
    toast.success("Pazaryeri toplamları kaydedildi");
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/raporlar">
          <ArrowLeft /> Raporlar
        </Link>
      </Button>
      <PageHeader
        eyebrow="Raporlar"
        title="Pazaryeri mutabakatı"
        description={`Trendyol satıcı panelindeki hakediş / cari hesap raporundaki toplamları girin. ${formatTRY(DEFAULT_TOLERANCE)} üzerindeki farklar işaretlenir.`}
      />

      <div className="mb-6 flex flex-col gap-3 rounded-xl border bg-paper p-3 sm:flex-row sm:items-center">
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger className="bg-card sm:w-56" aria-label="Mağaza">
            <SelectValue placeholder="Mağaza seçin" />
          </SelectTrigger>
          <SelectContent>
            {ws.stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="month"
          aria-label="Dönem"
          className="bg-card sm:w-48"
          value={period}
          onChange={(e) => e.target.value && setPeriod(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          Uygulamada bu dönem için {appTotals.count} sipariş kaydı var.
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel
          title="Pazaryeri toplamları"
          description="Otomatik aktarım yok; değerleri rapordan elle girin. Bilmediğiniz alanları boş bırakın."
        >
          {errors._form && (
            <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errors._form}</p>
          )}
          <form
            key={`${storeId}-${period}-${existing?.updatedAt ?? "new"}`}
            onSubmit={submit}
            className="grid gap-4 sm:grid-cols-2"
            noValidate
          >
            {KEYS.map((k) => (
              <Field key={k} label={`${RECON_LABELS[k]} (₺)`} htmlFor={`rc-${k}`} error={errors[k]}>
                <Input
                  id={`rc-${k}`}
                  name={k}
                  inputMode="decimal"
                  placeholder="—"
                  className="num"
                  defaultValue={toText(existing?.totals[k])}
                />
              </Field>
            ))}
            <Field label="Not" htmlFor="rc-note" error={errors.note} className="sm:col-span-2">
              <Textarea id="rc-note" name="note" rows={2} defaultValue={existing?.note} />
            </Field>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <Button type="submit">{existing ? "Güncelle ve karşılaştır" : "Kaydet ve karşılaştır"}</Button>
              {existing && <SourceBadge source={existing.source} />}
            </div>
          </form>
        </Panel>

        <Panel
          title={`${store?.name ?? ""} · ${formatPeriod(period)}`}
          description="Fark = uygulama − pazaryeri"
          actions={
            rows ? (
              mismatches > 0 ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="size-3" /> {mismatches} fark
                </Badge>
              ) : (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="size-3" /> Girilen alanlar uyumlu
                </Badge>
              )
            ) : null
          }
        >
          {!rows ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Scale className="mb-3 size-8 text-muted-foreground" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Bu mağaza ve dönem için pazaryeri toplamı girilmedi. Soldaki formu doldurduğunuzda karşılaştırma burada
                görünür.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kalem</TableHead>
                    <TableHead className="text-right">Uygulama</TableHead>
                    <TableHead className="text-right">Pazaryeri</TableHead>
                    <TableHead className="text-right">Fark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key} className={cn(r.status === "mismatch" && "bg-destructive/8")}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {r.status === "match" && <CheckCircle2 className="size-4 text-success" />}
                          {r.status === "mismatch" && <AlertTriangle className="size-4 text-destructive" />}
                          {r.status === "missing" && <MinusCircle className="size-4 text-muted-foreground" />}
                          {r.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right"><Money value={r.app} /></TableCell>
                      <TableCell className="text-right">
                        {r.marketplace == null ? <span className="text-xs text-muted-foreground">girilmedi</span> : <Money value={r.marketplace} />}
                      </TableCell>
                      <TableCell className={cn("text-right", r.status === "mismatch" && "font-semibold text-destructive")}>
                        {r.diff == null ? "—" : <Money value={r.diff} className={r.status === "mismatch" ? "text-destructive" : ""} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                Net hakediş (uygulama) = net satış − komisyon − sipariş kargosu − stopaj. Ayrıca girilen giderler (reklam,
                kira vb.) hakedişe dahil edilmez.
              </p>
            </div>
          )}
        </Panel>
      </div>

      {ws.reconciliations.length > 0 && (
        <Panel title="Kayıtlı mutabakatlar" className="mt-6">
          <ul className="divide-y">
            {[...ws.reconciliations]
              .sort((a, b) => b.period.localeCompare(a.period))
              .map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => {
                      setStoreId(r.storeId);
                      setPeriod(r.period);
                    }}
                  >
                    {formatPeriod(r.period)} · {ws.stores.find((s) => s.id === r.storeId)?.name ?? "—"}
                  </button>
                  <ConfirmDelete
                    trigger={
                      <Button variant="ghost" size="icon" aria-label="Sil">
                        <Trash2 />
                      </Button>
                    }
                    title="Mutabakat kaydı silinsin mi?"
                    description="Girdiğiniz pazaryeri toplamları silinir."
                    onConfirm={() => deleteReconciliation(ws.tenantId, r.id)}
                  />
                </li>
              ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
