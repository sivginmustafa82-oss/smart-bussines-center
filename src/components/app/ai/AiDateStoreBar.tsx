import { CalendarRange, Download, FileJson, Save, ShieldCheck, Store as StoreIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Store } from "@/lib/domain/types";
import { addDays, istanbulToday } from "../../../../supabase/functions/smart-business-api/trendyol-time";

export interface AiDateStoreBarProps {
  stores: Store[];
  storeId: string | "all";
  onStoreChange: (v: string | "all") => void;
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  dateError: string | null;
  onSaveReport: () => void;
  onExportExcel: () => void;
  onExportJson: () => void;
  exportDisabled: boolean;
}

export function AiDateStoreBar({
  stores,
  storeId,
  onStoreChange,
  from,
  to,
  onRangeChange,
  dateError,
  onSaveReport,
  onExportExcel,
  onExportJson,
  exportDisabled,
}: AiDateStoreBarProps) {
  const today = istanbulToday();
  const [year = 2026, month = 1] = today.split("-").map(Number);
  const validStore = storeId === "all" || stores.some((s) => s.id === storeId) ? storeId : "all";

  const quickRanges: { label: string; from: string; to: string }[] = [
    { label: "Son 7 gün", from: addDays(today, -6), to: today },
    { label: "Son 30 gün", from: addDays(today, -29), to: today },
    { label: "Bu ay", from: `${year}-${String(month).padStart(2, "0")}-01`, to: today },
    {
      label: "Geçen ay",
      from: new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10),
      to: new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10),
    },
    { label: "Son 90 gün", from: addDays(today, -89), to: today },
  ];

  return (
    <div className="mb-6 space-y-3">
      <div className="rounded-xl border bg-paper p-3.5 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex items-center gap-2">
              <StoreIcon className="size-4 shrink-0 text-muted-foreground" />
              <Select value={validStore} onValueChange={onStoreChange}>
                <SelectTrigger className="w-full bg-card sm:w-52" aria-label="Mağaza filtresi">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm mağazalar</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
              <Input
                type="date"
                aria-label="Başlangıç tarihi"
                className="w-40 bg-card"
                value={from}
                onChange={(e) => onRangeChange(e.target.value, to)}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                aria-label="Bitiş tarihi"
                className="w-40 bg-card"
                value={to}
                onChange={(e) => onRangeChange(from, e.target.value)}
              />
              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                Europe/Istanbul (UTC+3) · Bitiş dahil
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={onSaveReport} disabled={exportDisabled}>
              <Save className="size-3.5" /> Raporu kaydet
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onExportExcel} disabled={exportDisabled}>
              <Download className="size-3.5" /> Excel (.xlsx)
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onExportJson} disabled={exportDisabled}>
              <FileJson className="size-3.5" /> JSON
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
          <span className="mr-1 text-xs text-muted-foreground">Hızlı aralık:</span>
          {quickRanges.map((q) => {
            const active = from === q.from && to === q.to;
            return (
              <Button
                key={q.label}
                type="button"
                size="sm"
                variant={active ? "default" : "ghost"}
                className="h-7 px-2.5 text-xs"
                onClick={() => onRangeChange(q.from, q.to)}
              >
                {q.label}
              </Button>
            );
          })}
        </div>

        {dateError && (
          <p role="alert" className="mt-2 text-xs font-medium text-destructive">
            {dateError}
          </p>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border bg-card/80 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          <strong className="font-semibold text-foreground">Doğruluk ve güvenlik ilkesi:</strong> Bu ekran ChatGPT içindeki
          Trendyol eklentisine doğrudan bağlı değildir; yalnızca Smart Bussines Center’ın yetkili sunucu verileri ve uygulamada
          kayıtlı veriler üzerinden analiz üretir. Verisi olmayan alanlarda sayı uydurulmaz. Fiyat, stok, reklam bütçesi,
          kampanya veya Trendyol listeleme içerikleri otomatik değiştirilmez.
        </p>
      </div>
    </div>
  );
}