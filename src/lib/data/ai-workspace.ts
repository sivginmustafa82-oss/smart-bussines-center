/**
 * Tenant-scoped storage for AI analytics action statuses, saved periodic report snapshots,
 * user target margin preferences, and optional manual competitor entries.
 * Also provides a read-only Supabase reader for `ad_daily_performance`.
 */
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AdDailyPerformance, CompetitorEntry } from "@/lib/domain/types";
import type { ExecutiveItem } from "@/lib/domain/ai-insights";
import { newId, nowISO, readSession } from "./local-db";

export interface ActionCompletionRecord {
  key: string;
  actionId: string;
  title: string;
  storeId: string | "all";
  from: string;
  to: string;
  completed: boolean;
  completedAt: string | null;
}

export interface SavedAiReport {
  id: string;
  createdAt: string;
  storeId: string | "all";
  storeName: string;
  from: string;
  to: string;
  metrics: {
    grossSales: number;
    netSales: number;
    netUnits: number;
    netProfit: number;
    margin: number | null;
    missingCostRecords: number;
    returnsUnits: number;
    cancellationsUnits: number;
  };
  opportunities: ExecutiveItem[];
  risks: ExecutiveItem[];
  actions: (ExecutiveItem & { completed: boolean })[];
}

export interface AiWorkspaceState {
  version: 1;
  targetNetMarginPct: number;
  completions: Record<string, ActionCompletionRecord>;
  savedReports: SavedAiReport[];
  competitors: CompetitorEntry[];
}

const EMPTY_STATE: AiWorkspaceState = {
  version: 1,
  targetNetMarginPct: 15,
  completions: {},
  savedReports: [],
  competitors: [],
};

const STORAGE_PREFIX = "sbc:v1:ai-workspace:";
const cache = new Map<string, AiWorkspaceState>();
const listeners = new Set<() => void>();

const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

function emit() {
  for (const listener of listeners) listener();
}

export function actionStorageKey(actionId: string, storeId: string | "all", from: string, to: string): string {
  return `${actionId}::${storeId}::${from}..${to}`;
}

export function readAiWorkspace(tenantId: string): AiWorkspaceState {
  if (!tenantId) return EMPTY_STATE;
  const cached = cache.get(tenantId);
  if (cached) return cached;
  if (!hasStorage()) return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + tenantId);
    const parsed = raw ? (JSON.parse(raw) as Partial<AiWorkspaceState>) : null;
    const next: AiWorkspaceState =
      parsed && parsed.version === 1
        ? {
            version: 1,
            targetNetMarginPct:
              typeof parsed.targetNetMarginPct === "number" && Number.isFinite(parsed.targetNetMarginPct)
                ? parsed.targetNetMarginPct
                : 15,
            completions: parsed.completions ?? {},
            savedReports: Array.isArray(parsed.savedReports) ? parsed.savedReports : [],
            competitors: Array.isArray(parsed.competitors) ? parsed.competitors : [],
          }
        : EMPTY_STATE;
    cache.set(tenantId, next);
    return next;
  } catch {
    cache.set(tenantId, EMPTY_STATE);
    return EMPTY_STATE;
  }
}

function writeAiWorkspace(tenantId: string, updater: (prev: AiWorkspaceState) => AiWorkspaceState): AiWorkspaceState {
  if (!tenantId) return EMPTY_STATE;
  const next = updater(readAiWorkspace(tenantId));
  cache.set(tenantId, next);
  if (hasStorage()) {
    window.localStorage.setItem(STORAGE_PREFIX + tenantId, JSON.stringify(next));
  }
  emit();
  return next;
}

export function subscribeAiWorkspace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAiWorkspace(tenantId: string): AiWorkspaceState {
  return useSyncExternalStore(
    subscribeAiWorkspace,
    () => readAiWorkspace(tenantId),
    () => EMPTY_STATE,
  );
}

export function setTargetNetMarginPct(tenantId: string, pct: number) {
  const clamped = Math.max(0, Math.min(70, Math.round(pct)));
  writeAiWorkspace(tenantId, (prev) => ({ ...prev, targetNetMarginPct: clamped }));
}

export function toggleAiActionCompletion(
  tenantId: string,
  params: { actionId: string; title: string; storeId: string | "all"; from: string; to: string },
) {
  const key = actionStorageKey(params.actionId, params.storeId, params.from, params.to);
  writeAiWorkspace(tenantId, (prev) => {
    const existing = prev.completions[key];
    const nextCompleted = !(existing?.completed ?? false);
    return {
      ...prev,
      completions: {
        ...prev.completions,
        [key]: {
          key,
          actionId: params.actionId,
          title: params.title,
          storeId: params.storeId,
          from: params.from,
          to: params.to,
          completed: nextCompleted,
          completedAt: nextCompleted ? nowISO() : null,
        },
      },
    };
  });
}

export function saveAiReportSnapshot(tenantId: string, input: Omit<SavedAiReport, "id" | "createdAt">): SavedAiReport {
  const snapshot: SavedAiReport = {
    ...input,
    id: newId(),
    createdAt: nowISO(),
  };
  writeAiWorkspace(tenantId, (prev) => ({
    ...prev,
    savedReports: [snapshot, ...prev.savedReports].slice(0, 50),
  }));
  return snapshot;
}

export function deleteSavedAiReport(tenantId: string, reportId: string) {
  writeAiWorkspace(tenantId, (prev) => ({
    ...prev,
    savedReports: prev.savedReports.filter((r) => r.id !== reportId),
  }));
}

export function addCompetitorEntry(
  tenantId: string,
  input: Omit<CompetitorEntry, "id" | "tenantId" | "source" | "createdAt">,
): CompetitorEntry {
  const entry: CompetitorEntry = {
    ...input,
    id: newId(),
    tenantId,
    source: "manual",
    createdAt: nowISO(),
  };
  writeAiWorkspace(tenantId, (prev) => ({
    ...prev,
    competitors: [entry, ...prev.competitors],
  }));
  return entry;
}

export function deleteCompetitorEntry(tenantId: string, id: string) {
  writeAiWorkspace(tenantId, (prev) => ({
    ...prev,
    competitors: prev.competitors.filter((c) => c.id !== id),
  }));
}

/**
 * Read-only fetch of `ad_daily_performance` from Supabase for the active cloud organization.
 * Never writes or fabricates rows; returns [] if unauthenticated or if no ad rows exist.
 */
export async function fetchCloudAdPerformance(): Promise<AdDailyPerformance[]> {
  const session = readSession();
  if (!session?.cloudOrganizationId || session.authProvider !== "supabase") return [];

  const idMapKey = "sbc:v1:cloud-id-map:" + session.tenantId;
  let idMap: Record<string, string> = {};
  try {
    idMap = JSON.parse(window.localStorage.getItem(idMapKey) || "{}") as Record<string, string>;
  } catch {
    idMap = {};
  }

  const mapStoreId = (cloudStoreId: string): string => {
    const entry = Object.entries(idMap).find(([k, v]) => k.startsWith("store:") && v === cloudStoreId);
    return entry ? entry[0].slice("store:".length) : cloudStoreId;
  };

  const { data, error } = await supabase
    .from("ad_daily_performance")
    .select("id, store_id, external_campaign_id, campaign_name, performance_date, spend, revenue, impressions, clicks, orders_count, currency")
    .eq("organization_id", session.cloudOrganizationId)
    .order("performance_date", { ascending: false })
    .limit(1000);

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    storeId: mapStoreId(row.store_id),
    externalCampaignId: row.external_campaign_id,
    campaignName: row.campaign_name,
    date: row.performance_date,
    spend: Number(row.spend),
    revenue: Number(row.revenue),
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    ordersCount: Number(row.orders_count),
    currency: row.currency,
  }));
}