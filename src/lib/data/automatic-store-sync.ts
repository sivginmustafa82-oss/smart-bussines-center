import { supabase } from "@/integrations/supabase/client";
import type { Store } from "@/lib/domain/types";
import { readDB, readSession, subscribe, writeDB } from "./local-db";
import { clearPendingStoreEdits, getPendingStoreEdits, persistCloudIdMap, scoped } from "./repo";

type Row = Record<string, any>;
const MAP_PREFIX = "sbc:v1:cloud-id-map:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function localIdFor(cloudId: string, map: Record<string, string>) {
  const entry = Object.entries(map).find(([key, value]) => key.startsWith("store:") && value === cloudId);
  return entry ? entry[0].slice("store:".length) : cloudId;
}

function cloudIdFor(localId: string, map: Record<string, string>) {
  const key = "store:" + localId;
  if (map[key] && UUID_RE.test(map[key])) return map[key];
  const id = UUID_RE.test(localId) ? localId : crypto.randomUUID();
  map[key] = id;
  return id;
}

function marketplaceFromCloud(value: unknown): Store["marketplace"] {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "trendyol") return "trendyol";
  if (normalized === "hepsiburada") return "hepsiburada";
  if (normalized === "amazon" || normalized === "amazon_tr") return "amazon_tr";
  return "n11";
}

const marketplaceToCloud: Record<Store["marketplace"], string> = {
  trendyol: "Trendyol",
  hepsiburada: "Hepsiburada",
  amazon_tr: "Amazon",
  n11: "n11",
};

/**
 * Store-only automatic sync. It never deletes remote or local rows.
 * New stores and renames are pushed; cloud changes are pulled into this browser.
 */
export async function syncStoresAutomatically(): Promise<void> {
  const session = readSession();
  if (!session?.cloudOrganizationId || session.authProvider !== "supabase") return;
  const tenantId = session.tenantId;
  const organizationId = session.cloudOrganizationId;
  if (!window.localStorage.getItem("sbc:v1:cloud-sync:" + tenantId)) return;

  const mapKey = MAP_PREFIX + tenantId;
  let idMap: Record<string, string> = {};
  try {
    idMap = JSON.parse(window.localStorage.getItem(mapKey) || "{}") as Record<string, string>;
  } catch {
    idMap = {};
  }

  const localStores = scoped(readDB(), tenantId).stores;
  const pending = getPendingStoreEdits(tenantId);
  const upload = localStores.filter((store) => Boolean(pending[store.id]));
  const uploaded: Record<string, string> = {};

  const rows = upload.map((store) => ({
    id: cloudIdFor(store.id, idMap),
    organization_id: organizationId,
    marketplace: marketplaceToCloud[store.marketplace],
    name: store.name.trim(),
    country_code: "TR",
    currency: "TRY",
    timezone: "Europe/Istanbul",
    created_at: store.createdAt,
  }));

  idMap = persistCloudIdMap(tenantId, idMap);
  for (let offset = 0; offset < rows.length; offset += 200) {
    const { error } = await supabase.from("stores").upsert(rows.slice(offset, offset + 200), { onConflict: "id" });
    if (error) throw new Error("Mağaza otomatik eşitlenemedi: " + error.message);
  }
  for (const store of upload) uploaded[store.id] = pending[store.id];
  clearPendingStoreEdits(tenantId, uploaded);

  const { data, error } = await supabase
    .from("stores")
    .select("id, marketplace, name, created_at, updated_at")
    .eq("organization_id", organizationId);
  if (error) throw new Error("Buluttaki mağazalar okunamadı: " + error.message);

  const stillPending = getPendingStoreEdits(tenantId);
  const incoming: Store[] = ((data ?? []) as Row[]).map((row) => {
    const id = localIdFor(row.id, idMap);
    if (!idMap["store:" + id]) idMap["store:" + id] = row.id;
    return {
      id,
      tenantId,
      name: String(row.name ?? ""),
      marketplace: marketplaceFromCloud(row.marketplace),
      connectionStatus: "not_connected",
      createdAt: row.created_at,
    };
  });

  const current = scoped(readDB(), tenantId).stores;
  const merged = new Map(current.map((store) => [store.id, store]));
  for (const remote of incoming) {
    if (stillPending[remote.id]) continue;
    merged.set(remote.id, remote);
  }
  const next = [...merged.values()];
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    writeDB((db) => ({
      ...db,
      stores: [...db.stores.filter((store) => store.tenantId !== tenantId), ...next],
    }));
  }
  persistCloudIdMap(tenantId, idMap);
  window.localStorage.setItem(
    "sbc:v1:auto-store-sync:" + tenantId,
    JSON.stringify({ syncedAt: new Date().toISOString(), pulled: incoming.length, pushed: upload.length }),
  );
}

let active = false;
export function startAutomaticStoreSync(): () => void {
  if (typeof window === "undefined" || active) return () => {};
  active = true;
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let rerunRequested = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const run = () => {
    if (stopped || document.visibilityState === "hidden" || !navigator.onLine) return;
    if (inFlight) {
      rerunRequested = true;
      return;
    }
    inFlight = syncStoresAutomatically()
      .catch((error) => console.warn("[AutoSync] Store sync deferred:", error))
      .finally(() => {
        inFlight = null;
        if (rerunRequested && !stopped) {
          rerunRequested = false;
          run();
        }
      });
  };

  const scheduleDirtyPush = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const session = readSession();
      if (session && Object.keys(getPendingStoreEdits(session.tenantId)).length) run();
    }, 250);
  };

  const unsubscribe = subscribe(scheduleDirtyPush);
  const interval = window.setInterval(run, 5_000);
  const onOnline = () => run();
  const onVisibility = () => { if (document.visibilityState === "visible") run(); };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);

  const session = readSession();
  const realtimeChannel = session?.cloudOrganizationId && session.authProvider === "supabase"
    ? supabase
        .channel("auto-store-sync:" + session.tenantId)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "stores",
            filter: "organization_id=eq." + session.cloudOrganizationId,
          },
          () => run(),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") run();
        })
    : null;

  run();
  return () => {
    stopped = true;
    active = false;
    unsubscribe();
    if (debounce) clearTimeout(debounce);
    window.clearInterval(interval);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
  };
}
