import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { CalendarRange, Store as StoreIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayISO } from "@/lib/format";
import type { Filters } from "@/lib/domain/profitability";
import type { Store } from "@/lib/domain/types";

export type Preset = "all" | "this_month" | "last_month" | "last_90" | "this_year" | "custom";

export const PRESET_LABELS: Record<Preset, string> = {
  all: "Tüm zamanlar",
  this_month: "Bu ay",
  last_month: "Geçen ay",
  last_90: "Son 90 gün",
  this_year: "Bu yıl",
  custom: "Özel aralık",
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function presetRange(p: Preset, custom: { from: string; to: string }): { from: string | null; to: string | null } {
  const now = new Date();
  switch (p) {
    case "all":
      return { from: null, to: null };
    case "this_month":
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: todayISO() };
    case "last_month":
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "last_90": {
      const d = new Date(now);
      d.setDate(d.getDate() - 89);
      return { from: iso(d), to: todayISO() };
    }
    case "this_year":
      return { from: `${now.getFullYear()}-01-01`, to: todayISO() };
    case "custom":
      return { from: custom.from || null, to: custom.to || null };
  }
}

interface Ctx {
  storeId: string | "all";
  setStoreId: (v: string | "all") => void;
  preset: Preset;
  setPreset: (p: Preset) => void;
  custom: { from: string; to: string };
  setCustom: (c: { from: string; to: string }) => void;
  filters: Filters;
}

const FiltersContext = createContext<Ctx | null>(null);

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [storeId, setStoreId] = useState<string | "all">("all");
  const [preset, setPreset] = useState<Preset>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const value = useMemo<Ctx>(() => {
    const range = presetRange(preset, custom);
    return { storeId, setStoreId, preset, setPreset, custom, setCustom, filters: { storeId, ...range } };
  }, [storeId, preset, custom]);
  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used inside FiltersProvider");
  return ctx;
}

export function FilterBar({ stores }: { stores: Store[] }) {
  const { storeId, setStoreId, preset, setPreset, custom, setCustom } = useFilters();
  const validStore = storeId === "all" || stores.some((s) => s.id === storeId) ? storeId : "all";
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border bg-paper p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex items-center gap-2">
        <StoreIcon className="size-4 text-muted-foreground" />
        <Select value={validStore} onValueChange={(v) => setStoreId(v)}>
          <SelectTrigger className="w-full bg-card sm:w-56" aria-label="Mağaza filtresi">
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
      <div className="flex items-center gap-2">
        <CalendarRange className="size-4 text-muted-foreground" />
        <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <SelectTrigger className="w-full bg-card sm:w-44" aria-label="Dönem filtresi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PRESET_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="Başlangıç tarihi"
            className="bg-card"
            value={custom.from}
            onChange={(e) => setCustom({ ...custom, from: e.target.value })}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            aria-label="Bitiş tarihi"
            className="bg-card"
            value={custom.to}
            onChange={(e) => setCustom({ ...custom, to: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
