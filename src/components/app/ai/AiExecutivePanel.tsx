import { AlertTriangle, CheckCircle2, History, Lightbulb, ListChecks, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Money, Panel } from "@/components/app/ui-bits";
import type { ConfidenceLevel, ExecutiveItem, ExecutiveSummary } from "@/lib/domain/ai-insights";
import { actionStorageKey, type ActionCompletionRecord, type SavedAiReport } from "@/lib/data/ai-workspace";
import { formatDate, formatIstanbulDateTime, formatPercent } from "@/lib/format";

const CONFIDENCE_META: Record<ConfidenceLevel, { label: string; variant: "verified" | "info" | "neutral" }> = {
  yuksek: { label: "Güven: Yüksek", variant: "verified" },
  orta: { label: "Güven: Orta", variant: "info" },
  dusuk: { label: "Güven: Düşük", variant: "neutral" },
};

function EvidenceBlock({ item }: { item: ExecutiveItem }) {
  const conf = CONFIDENCE_META[item.confidence];
  return (
    <div className="mt-2.5 space-y-1.5 rounded-lg bg-muted/45 p-2.5 text-xs">
      <p className="text-foreground/90">
        <span className="font-semibold">Veri dayanağı:</span> {item.evidence}
      </p>
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground/80">Tahmini etki:</span> {item.estimatedImpact}
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Badge variant={conf.variant} className="text-[11px]">
          {conf.label}
        </Badge>
        <span className="text-[11px] text-muted-foreground">{item.confidenceReason}</span>
      </div>
    </div>
  );
}

export function AiExecutivePanel({
  executive,
  storeId,
  from,
  to,
  completions,
  onToggleAction,
  savedReports,
  onDeleteReport,
  onSelectReportRange,
}: {
  executive: ExecutiveSummary;
  storeId: string | "all";
  from: string;
  to: string;
  completions: Record<string, ActionCompletionRecord>;
  onToggleAction: (item: ExecutiveItem) => void;
  savedReports: SavedAiReport[];
  onDeleteReport: (id: string) => void;
  onSelectReportRange: (storeId: string | "all", from: string, to: string) => void;
}) {
  const completedRecords = Object.values(completions)
    .filter((c) => c.completed)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Lightbulb className="size-4 text-primary" /> En Önemli Fırsatlar (En Fazla 3)
            </span>
          }
          description="Seçili dönem verilerinden izlenebilir şekilde çıkarılan öncelikli fırsatlar."
        >
          {executive.opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Seçili tarih aralığında fırsat çıkarımı için yeterli satış veya katalog verisi bulunmuyor.
            </p>
          ) : (
            <div className="space-y-3">
              {executive.opportunities.map((item) => (
                <article key={item.id} className="rounded-xl border bg-background/60 p-3.5">
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                  <EvidenceBlock item={item} />
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" /> En Önemli Riskler (En Fazla 3)
            </span>
          }
          description="Kârlılığı veya veri doğruluğunu etkileyen mevcut risk sinyalleri."
        >
          {executive.risks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Seçili dönemde belirgin bir risk sinyali tespit edilmedi.
            </p>
          ) : (
            <div className="space-y-3">
              {executive.risks.map((item) => (
                <article key={item.id} className="rounded-xl border bg-background/60 p-3.5">
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                  <EvidenceBlock item={item} />
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <ListChecks className="size-4 text-primary" /> Uygulanabilir Aksiyon Listesi (En Fazla 3)
          </span>
        }
        description="Tamamladığınız aksiyonları işaretleyin. İşaretler tarayıcı çalışma alanınızda dönem bilgisiyle saklanır; mağazada otomatik değişiklik yapılmaz."
      >
        {executive.actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Seçili dönem için önerilecek açık aksiyon bulunmuyor.
          </p>
        ) : (
          <div className="space-y-3">
            {executive.actions.map((action) => {
              const key = actionStorageKey(action.id, storeId, from, to);
              const rec = completions[key];
              const done = rec?.completed ?? false;
              return (
                <div
                  key={action.id}
                  className="flex items-start gap-3 rounded-xl border bg-background/60 p-4 transition-colors"
                >
                  <Checkbox
                    id={`act-${action.id}`}
                    checked={done}
                    onCheckedChange={() => onToggleAction(action)}
                    className="mt-1"
                    aria-label={`${action.title} aksiyonunu tamamlandı olarak işaretle`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor={`act-${action.id}`}
                        className={`cursor-pointer text-sm font-semibold ${done ? "line-through text-muted-foreground" : "text-foreground"}`}
                      >
                        {action.title}
                      </label>
                      {done && (
                        <Badge variant="verified" className="gap-1">
                          <CheckCircle2 className="size-3" /> Tamamlandı
                          {rec?.completedAt ? ` · ${formatIstanbulDateTime(rec.completedAt) ?? ""}` : ""}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{action.detail}</p>
                    <EvidenceBlock item={action} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={
            <span className="flex items-center gap-2">
              <History className="size-4 text-primary" /> Kayıtlı Geçmiş Raporlar ({savedReports.length})
            </span>
          }
          description="Üstteki 'Raporu kaydet' ile arşivlediğiniz haftalık/dönemsel özetler."
        >
          {savedReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz kaydedilmiş bir dönemsel rapor yok. Seçili dönemi arşivlemek için yukarıdaki “Raporu kaydet” düğmesini kullanın.
            </p>
          ) : (
            <div className="space-y-2.5">
              {savedReports.map((rep) => (
                <div key={rep.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/60 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {formatDate(rep.from)} – {formatDate(rep.to)}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{rep.storeName}</span>
                      <span>·</span>
                      <span>Net satış: <Money value={rep.metrics.netSales} /></span>
                      <span>·</span>
                      <span>Net kâr: <Money value={rep.metrics.netProfit} /></span>
                      <span>·</span>
                      <span>Marj: {formatPercent(rep.metrics.margin)}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Kayıt: {formatIstanbulDateTime(rep.createdAt) ?? rep.createdAt} · {rep.actions.filter((a) => a.completed).length}/{rep.actions.length} aksiyon tamamlandı
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => onSelectReportRange(rep.storeId, rep.from, rep.to)}
                    >
                      Dönemi aç
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      aria-label="Kayıtlı raporu sil"
                      onClick={() => onDeleteReport(rep.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={`Tamamlanan Aksiyon Geçmişi (${completedRecords.length})`}
          description="Farklı tarih aralıklarında tamamlandı olarak işaretlenen aksiyonlar."
        >
          {completedRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz tamamlandı olarak işaretlenmiş aksiyon bulunmuyor.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {completedRecords.slice(0, 12).map((c) => (
                <li key={c.key} className="flex items-start justify-between gap-3 rounded-lg border bg-background/60 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground">{c.title}</div>
                    <div className="text-muted-foreground">
                      Dönem: {formatDate(c.from)} – {formatDate(c.to)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {c.completedAt ? formatIstanbulDateTime(c.completedAt) ?? "" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}