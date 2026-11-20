import { supabase } from "@/integrations/supabase/client";
import type {
  DataSource,
  Expense,
  Marketplace,
  OrderRecord,
  Product,
  ReconciliationEntry,
  Store,
} from "@/lib/domain/types";
import { readDB, readSession, writeDB } from "./local-db";
import { clearPendingProductEdits, getPendingProductEdits, scoped } from "./repo";
import { importLocalWorkspaceToSupabase } from "./cloud-import";

export interface CloudSyncResult {
  syncedAt: string;
  stores: number;
  products: number;
  orders: number;
  expenses: number;
  reconciliations: number;
}

type Row = Record<string, any>;

function source(value: unknown): DataSource {
  return value === "imported" ? "imported" : "manual";
}

function marketplace(value: unknown): Marketplace {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "trendyol") return "trendyol";
  if (normalized === "hepsiburada") return "hepsiburada";
  if (normalized === "amazon" || normalized === "amazon_tr") return "amazon_tr";
  return "n11";
}

function localIdFor(kind: string, cloudId: string, map: Record<string, string>): string {
  const entry = Object.entries(map).find(([key, value]) => key.startsWith(kind + ":") && value === cloudId);
  return entry ? entry[0].slice(kind.length + 1) : cloudId;
}

function mergeById<T extends { id: string }>(local: T[], incoming: T[]): T[] {
  const byId = new Map(local.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()];
}

/**
 * Product edits can happen independently on desktop and mobile. Keep the newest
 * version instead of always letting the cloud copy overwrite a newer local edit.
 * The subsequent importLocalWorkspaceToSupabase call pushes that newer version.
 */
function mergeProductsByUpdatedAt(local: Product[], incoming: Product[], pendingLocalIds: Set<string>): Product[] {
  const byId = new Map(local.map((row) => [row.id, row]));
  for (const row of incoming) {
    if (pendingLocalIds.has(row.id)) continue;
    const existing = byId.get(row.id);
    if (!existing || Date.parse(row.updatedAt) >= Date.parse(existing.updatedAt)) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

async function readAllRows(
  table: "stores" | "products" | "product_variants" | "product_costs" | "order_records" | "expenses" | "reconciliations",
  organizationId: string,
): Promise<Row[]> {
  const all: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("organization_id", organizationId)
      .range(offset, offset + 999);
    if (error) throw new Error("Bulut kayıtları okunamadı (" + table + "): " + error.message);
    const batch = (data ?? []) as Row[];
    all.push(...batch);
    if (batch.length < 1000) return all;
  }
}

/**
 * Pulls organization-owned rows into the browser cache, then pushes the merged
 * cache back. It never deletes remote rows or clears local data.
 */
export async function syncWorkspaceWithCloud(): Promise<CloudSyncResult> {
  const session = readSession();
  if (!session?.cloudOrganizationId || session.authProvider !== "supabase") {
    throw new Error("Bulut çalışma alanı bulunamadı. Önce hesabınızla yeniden giriş yapın.");
  }

  const orgId = session.cloudOrganizationId;
  // Protect unsynced local product versions before pulling cloud rows; this is independent of device clock accuracy.
  const pendingProductEdits = getPendingProductEdits(session.tenantId);
  const localProductVersions = new Map(scoped(readDB(), session.tenantId).products.map((p) => [p.id, p.updatedAt]));
  const pendingLocalProductIds = new Set(
    Object.entries(pendingProductEdits).filter(([id, updatedAt]) => localProductVersions.get(id) === updatedAt).map(([id]) => id),
  );
  const idMapKey = "sbc:v1:cloud-id-map:" + session.tenantId;
  let idMap: Record<string, string> = {};
  try {
    idMap = JSON.parse(window.localStorage.getItem(idMapKey) || "{}") as Record<string, string>;
  } catch {
    idMap = {};
  }

  const [storesRows, productsRows, variantsRows, costsRows, ordersRows, expensesRows, reconciliationsRows] =
    await Promise.all([
      readAllRows("stores", orgId),
      readAllRows("products", orgId),
      readAllRows("product_variants", orgId),
      readAllRows("product_costs", orgId),
      readAllRows("order_records", orgId),
      readAllRows("expenses", orgId),
      readAllRows("reconciliations", orgId),
    ]);
  costsRows.sort((a, b) =>
    String(b.effective_from ?? "").localeCompare(String(a.effective_from ?? "")) ||
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );

  const storeIdMap = new Map<string, string>();
  const productIdMap = new Map<string, string>();
  const variantByProduct = new Map<string, Row>();
  const latestCostByVariant = new Map<string, Row>();

  for (const row of storesRows) storeIdMap.set(row.id, localIdFor("store", row.id, idMap));
  for (const row of productsRows) productIdMap.set(row.id, localIdFor("product", row.id, idMap));
  for (const row of variantsRows) {
    if (!variantByProduct.has(row.product_id)) variantByProduct.set(row.product_id, row);
  }
  for (const row of costsRows) {
    if (!latestCostByVariant.has(row.variant_id)) latestCostByVariant.set(row.variant_id, row);
  }

  const stores: Store[] = storesRows.map((row) => ({
    id: storeIdMap.get(row.id)!,
    tenantId: session.tenantId,
    name: row.name,
    marketplace: marketplace(row.marketplace),
    connectionStatus: "not_connected",
    createdAt: row.created_at,
  }));

  const products: Product[] = productsRows.map((row) => {
    const variant = variantByProduct.get(row.id);
    const cost = variant ? latestCostByVariant.get(variant.id) : undefined;
    return {
      id: productIdMap.get(row.id)!,
      tenantId: session.tenantId,
      storeId: storeIdMap.get(row.store_id) ?? localIdFor("store", row.store_id, idMap),
      name: row.title,
      sku: variant?.sku ?? "",
      barcode: variant?.barcode ?? "",
      unitCost: cost ? Number(cost.unit_cost) : null,
      vatRate: Number(variant?.vat_rate ?? 20),
      source: source(row.data_source),
      verified: Boolean(row.verified),
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
    };
  });

  const orders: OrderRecord[] = ordersRows.map((row) => ({
    id: localIdFor("order", row.id, idMap),
    tenantId: session.tenantId,
    storeId: storeIdMap.get(row.store_id) ?? localIdFor("store", row.store_id, idMap),
    type: row.record_type === "return" || row.record_type === "cancellation" ? row.record_type : "sale",
    orderNumber: row.order_number,
    date: row.record_date,
    productId: row.product_id ? productIdMap.get(row.product_id) ?? localIdFor("product", row.product_id, idMap) : null,
    quantity: Number(row.quantity),
    grossAmount: Number(row.gross_amount),
    discountAmount: Number(row.discount_amount),
    couponAmount: Number(row.coupon_amount),
    commissionAmount: Number(row.commission_amount),
    shippingAmount: Number(row.shipping_amount),
    withholdingAmount: Number(row.withholding_amount),
    note: row.note ?? "",
    source: source(row.data_source),
    verified: Boolean(row.verified),
    createdAt: row.created_at,
  }));

  const expenses: Expense[] = expensesRows.map((row) => ({
    id: localIdFor("expense", row.id, idMap),
    tenantId: session.tenantId,
    storeId: row.store_id ? storeIdMap.get(row.store_id) ?? localIdFor("store", row.store_id, idMap) : null,
    date: row.expense_date,
    category: row.category,
    amount: Number(row.amount),
    description: row.description ?? "",
    source: source(row.data_source),
    createdAt: row.created_at,
  }));

  const reconciliations: ReconciliationEntry[] = reconciliationsRows.map((row) => ({
    id: localIdFor("reconciliation", row.id, idMap),
    tenantId: session.tenantId,
    storeId: storeIdMap.get(row.store_id) ?? localIdFor("store", row.store_id, idMap),
    period: row.period,
    totals: {
      grossSales: row.gross_sales === null ? null : Number(row.gross_sales),
      cancellations: row.cancellations === null ? null : Number(row.cancellations),
      returns: row.returns === null ? null : Number(row.returns),
      discounts: row.discounts === null ? null : Number(row.discounts),
      commission: row.commission === null ? null : Number(row.commission),
      shipping: row.shipping === null ? null : Number(row.shipping),
      withholding: row.withholding === null ? null : Number(row.withholding),
      netPayout: row.net_payout === null ? null : Number(row.net_payout),
    },
    source: source(row.data_source),
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  }));

  writeDB((db) => ({
    ...db,
    stores: mergeById(db.stores.filter((row) => row.tenantId !== session.tenantId), stores)
      .concat(db.stores.filter((row) => row.tenantId === session.tenantId && !stores.some((incoming) => incoming.id === row.id))),
    products: mergeProductsByUpdatedAt(db.products, products, pendingLocalProductIds),
    orders: mergeById(db.orders.filter((row) => row.tenantId !== session.tenantId), orders)
      .concat(db.orders.filter((row) => row.tenantId === session.tenantId && !orders.some((incoming) => incoming.id === row.id))),
    expenses: mergeById(db.expenses.filter((row) => row.tenantId !== session.tenantId), expenses)
      .concat(db.expenses.filter((row) => row.tenantId === session.tenantId && !expenses.some((incoming) => incoming.id === row.id))),
    reconciliations: mergeById(db.reconciliations.filter((row) => row.tenantId !== session.tenantId), reconciliations)
      .concat(db.reconciliations.filter((row) => row.tenantId === session.tenantId && !reconciliations.some((incoming) => incoming.id === row.id))),
  }));

  // Pushes local-only records and updates after the pull. No remote DELETE is issued.
  await importLocalWorkspaceToSupabase();
  clearPendingProductEdits(session.tenantId, pendingProductEdits);
  const result: CloudSyncResult = {
    syncedAt: new Date().toISOString(),
    stores: stores.length,
    products: products.length,
    orders: orders.length,
    expenses: expenses.length,
    reconciliations: reconciliations.length,
  };
  window.localStorage.setItem("sbc:v1:cloud-sync:" + session.tenantId, JSON.stringify(result));
  return result;
}
