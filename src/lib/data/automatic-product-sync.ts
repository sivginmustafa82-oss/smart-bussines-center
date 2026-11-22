import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/domain/types";
import { readDB, readSession, subscribe, writeDB } from "./local-db";
import { clearPendingProductEdits, getPendingProductEdits, scoped } from "./repo";

type Row = Record<string, any>;
const MAP_PREFIX = "sbc:v1:cloud-id-map:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function localIdFor(kind: string, cloudId: string, map: Record<string, string>) {
  const entry = Object.entries(map).find(([key, value]) => key.startsWith(kind + ":") && value === cloudId);
  return entry ? entry[0].slice(kind.length + 1) : cloudId;
}

function ensureCloudId(map: Record<string, string>, kind: string, localId: string) {
  const key = kind + ":" + localId;
  const existing = map[key];
  if (existing && UUID_RE.test(existing)) return existing;
  const id = UUID_RE.test(localId) ? localId : crypto.randomUUID();
  map[key] = id;
  return id;
}

async function readRows(table: "products" | "product_variants" | "product_costs", organizationId: string): Promise<Row[]> {
  const { data, error } = await supabase.from(table).select("*").eq("organization_id", organizationId);
  if (error) throw new Error("Otomatik ürün eşitlemesi okunamadı (" + table + "): " + error.message);
  return (data ?? []) as Row[];
}

/**
 * Product-only two-way sync. It intentionally does not write orders, expenses,
 * stores or reconciliations; those record types still use the explicit full sync
 * until their conflict/deletion handling is upgraded.
 */
export async function syncProductsAutomatically(): Promise<void> {
  const session = readSession();
  if (!session?.cloudOrganizationId || session.authProvider !== "supabase") return;

  const tenantId = session.tenantId;
  const orgId = session.cloudOrganizationId;
  // The explicit first full sync establishes stable local/cloud ID mappings.
  // Do not auto-pull into an uninitialized browser, where it could create duplicate local IDs.
  if (!window.localStorage.getItem("sbc:v1:cloud-sync:" + tenantId)) return;
  const pending = getPendingProductEdits(tenantId);
  const localProductsBefore = scoped(readDB(), tenantId).products;
  const localVersions = new Map(localProductsBefore.map((product) => [product.id, product.updatedAt]));
  const pendingIds = new Set(
    Object.entries(pending)
      .filter(([id, updatedAt]) => localVersions.get(id) === updatedAt)
      .map(([id]) => id),
  );

  const mapKey = MAP_PREFIX + tenantId;
  let idMap: Record<string, string> = {};
  try {
    idMap = JSON.parse(window.localStorage.getItem(mapKey) || "{}") as Record<string, string>;
  } catch {
    idMap = {};
  }

  const [productsRows, variantsRows, costsRows] = await Promise.all([
    readRows("products", orgId),
    readRows("product_variants", orgId),
    readRows("product_costs", orgId),
  ]);
  costsRows.sort((a, b) =>
    String(b.effective_from ?? "").localeCompare(String(a.effective_from ?? "")) ||
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );

  const variantByProduct = new Map<string, Row>();
  const latestCostByVariant = new Map<string, Row>();
  for (const row of variantsRows) if (!variantByProduct.has(row.product_id)) variantByProduct.set(row.product_id, row);
  for (const row of costsRows) if (!latestCostByVariant.has(row.variant_id)) latestCostByVariant.set(row.variant_id, row);

  const incoming: Product[] = productsRows.map((row) => {
    const variant = variantByProduct.get(row.id);
    const cost = variant ? latestCostByVariant.get(variant.id) : undefined;
    return {
      id: localIdFor("product", row.id, idMap),
      tenantId,
      storeId: localIdFor("store", row.store_id, idMap),
      name: row.title,
      sku: variant?.sku ?? "",
      barcode: variant?.barcode ?? "",
      unitCost: cost ? Number(cost.unit_cost) : null,
      vatRate: Number(variant?.vat_rate ?? 20),
      source: row.data_source === "imported" ? "imported" : "manual",
      verified: Boolean(row.verified),
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
    };
  });

  const merged = new Map(localProductsBefore.map((product) => [product.id, product]));
  for (const remote of incoming) {
    if (pendingIds.has(remote.id)) continue;
    const local = merged.get(remote.id);
    if (!local || Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt)) merged.set(remote.id, remote);
  }
  const mergedProducts = [...merged.values()];
  if (JSON.stringify(localProductsBefore) !== JSON.stringify(mergedProducts)) {
    writeDB((db) => ({
      ...db,
      products: [...db.products.filter((product) => product.tenantId !== tenantId), ...mergedProducts],
    }));
  }

  // Upload only explicitly dirty product versions; never upsert the whole workspace here.
  const currentProducts = scoped(readDB(), tenantId).products;
  const upload = currentProducts.filter((product) => pendingIds.has(product.id));
  const uploaded: Record<string, string> = {};
  const storeIdMap = new Map<string, string>();
  for (const product of upload) {
    const storeCloudId = idMap["store:" + product.storeId];
    if (!storeCloudId || !UUID_RE.test(storeCloudId)) {
      throw new Error("Ürünün mağaza bulut eşlemesi bulunamadı. İlk tam bulut eşitlemesini bir kez manuel yapın.");
    }
    if (product.unitCost === null) {
      const remoteProductId = idMap["product:" + product.id] ?? product.id;
      const remoteVariant = variantByProduct.get(remoteProductId);
      if (remoteVariant && latestCostByVariant.has(remoteVariant.id)) {
        throw new Error("Bu ürünün bulutta kayıtlı eski maliyeti var. Maliyet silme işlemi veri kaybını önlemek için otomatik eşitlemede bekletildi.");
      }
    }
    storeIdMap.set(product.storeId, storeCloudId);
  }

  const productRows = upload.map((product) => ({
    id: ensureCloudId(idMap, "product", product.id),
    organization_id: orgId,
    store_id: storeIdMap.get(product.storeId)!,
    title: product.name,
    status: "active",
    data_source: product.source,
    verified: product.verified,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  }));
  const variantRows = upload.map((product) => ({
    id: ensureCloudId(idMap, "variant", product.id),
    organization_id: orgId,
    product_id: ensureCloudId(idMap, "product", product.id),
    sku: product.sku.trim() || null,
    barcode: product.barcode.trim() || null,
    vat_rate: product.vatRate,
    currency: "TRY",
  }));
  const costRows = upload.filter((product) => product.unitCost !== null).map((product) => ({
    id: ensureCloudId(idMap, "cost", product.id + ":" + product.updatedAt),
    organization_id: orgId,
    variant_id: ensureCloudId(idMap, "variant", product.id),
    unit_cost: product.unitCost!,
    currency: "TRY",
    effective_from: (product.updatedAt || product.createdAt).slice(0, 10),
    source: "manual",
  }));

  window.localStorage.setItem(mapKey, JSON.stringify(idMap));
  if (productRows.length) {
    const { error } = await supabase.from("products").upsert(productRows, { onConflict: "id" });
    if (error) throw new Error("Ürün otomatik gönderilemedi: " + error.message);
    const { error: variantError } = await supabase.from("product_variants").upsert(variantRows, { onConflict: "id" });
    if (variantError) throw new Error("Ürün varyantı otomatik gönderilemedi: " + variantError.message);
    if (costRows.length) {
      const { error: costError } = await supabase.from("product_costs").upsert(costRows, { onConflict: "id", ignoreDuplicates: true });
      if (costError) throw new Error("Ürün maliyeti otomatik gönderilemedi: " + costError.message);
    }
    for (const product of upload) uploaded[product.id] = product.updatedAt;
    clearPendingProductEdits(tenantId, uploaded);
  }

  window.localStorage.setItem(
    "sbc:v1:auto-product-sync:" + tenantId,
    JSON.stringify({ syncedAt: new Date().toISOString(), pulled: incoming.length, pushed: upload.length }),
  );
}

let active = false;
let inFlight: Promise<void> | null = null;

export function startAutomaticProductSync(): () => void {
  if (typeof window === "undefined" || active) return () => {};
  active = true;
  let stopped = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  const run = () => {
    if (stopped || document.visibilityState === "hidden" || !navigator.onLine || inFlight) return;
    inFlight = syncProductsAutomatically()
      .catch((error) => console.warn("[AutoSync] Product sync deferred:", error))
      .finally(() => { inFlight = null; });
  };

  const scheduleDirtyPush = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const session = readSession();
      if (session && Object.keys(getPendingProductEdits(session.tenantId)).length) run();
    }, 900);
  };

  const unsubscribe = subscribe(scheduleDirtyPush);
  const interval = window.setInterval(run, 30_000);
  const onOnline = () => run();
  const onVisibility = () => { if (document.visibilityState === "visible") run(); };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  run();

  return () => {
    stopped = true;
    active = false;
    unsubscribe();
    if (debounce) clearTimeout(debounce);
    window.clearInterval(interval);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
