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
import {
  extractTrendyolTimestampsFromNote,
  parseTimestampMs,
} from "../../../supabase/functions/smart-business-api/trendyol-time";

export interface CloudSyncResult {
  syncedAt: string;
  stores: number;
  products: number;
  orders: number;
  expenses: number;
  reconciliations: number;
}

type Row = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === "string" ? value : String(value ?? ""));
const nullableNum = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

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
    str(b["effective_from"]).localeCompare(str(a["effective_from"])) ||
    str(b["created_at"]).localeCompare(str(a["created_at"])),
  );

  const storeIdMap = new Map<string, string>();
  const productIdMap = new Map<string, string>();
  const variantByProduct = new Map<string, Row>();
  const variantsByProduct = new Map<string, Row[]>();
  const latestCostByVariant = new Map<string, Row>();

  for (const row of storesRows) {
    const id = str(row["id"]);
    storeIdMap.set(id, localIdFor("store", id, idMap));
  }
  for (const row of productsRows) {
    const id = str(row["id"]);
    productIdMap.set(id, localIdFor("product", id, idMap));
  }
  for (const row of variantsRows) {
    const pid = str(row["product_id"]);
    if (!variantByProduct.has(pid)) variantByProduct.set(pid, row);
    const list = variantsByProduct.get(pid) ?? [];
    list.push(row);
    variantsByProduct.set(pid, list);
  }
  for (const row of costsRows) {
    const vid = str(row["variant_id"]);
    if (!latestCostByVariant.has(vid)) latestCostByVariant.set(vid, row);
  }

  const stores: Store[] = storesRows.map((row) => {
    const id = str(row["id"]);
    return {
      id: storeIdMap.get(id) ?? id,
      tenantId: session.tenantId,
      name: str(row["name"]),
      marketplace: marketplace(row["marketplace"]),
      connectionStatus: row["connection_status"] === "connected" ? "connected" : "not_connected",
      createdAt: str(row["created_at"]),
    };
  });

  const products: Product[] = productsRows.map((row) => {
    const id = str(row["id"]);
    const storeId = str(row["store_id"]);
    const allVariants = variantsByProduct.get(id) ?? [];
    const variant = variantByProduct.get(id);
    const cost =
      (variant ? latestCostByVariant.get(str(variant["id"])) : undefined) ??
      allVariants.map((v) => latestCostByVariant.get(str(v["id"]))).find((c) => c != null);
    const realVariants = allVariants
      .filter((v) => str(v["id"]) !== id || Boolean(v["variant_name"]) || Boolean(v["external_variant_id"]))
      .map((v) => ({
        id: str(v["id"]),
        barcode: str(v["barcode"]),
        sku: str(v["sku"]),
        name: str(v["variant_name"]),
        salePrice: nullableNum(v["sale_price"]),
        listPrice: nullableNum(v["list_price"]),
        stock: Number(v["stock_quantity"] ?? 0),
      }));
    const externalProductId = row["external_product_id"] ? str(row["external_product_id"]) : undefined;
    const category = row["category"] ? str(row["category"]) : undefined;
    const brand = row["brand"] ? str(row["brand"]) : undefined;
    const productUrl = row["product_url"] ? str(row["product_url"]) : undefined;
    return {
      id: productIdMap.get(id) ?? id,
      tenantId: session.tenantId,
      storeId: storeIdMap.get(storeId) ?? localIdFor("store", storeId, idMap),
      name: str(row["title"]),
      sku: str(variant?.["sku"]),
      barcode: str(variant?.["barcode"]),
      unitCost: cost ? Number(cost["unit_cost"]) : null,
      vatRate: Number(variant?.["vat_rate"] ?? 20),
      source: source(row["data_source"]),
      verified: Boolean(row["verified"]),
      createdAt: str(row["created_at"]),
      updatedAt: str(row["updated_at"] ?? row["created_at"]),
      ...(externalProductId ? { externalProductId } : {}),
      ...(realVariants.length > 0 ? { variants: realVariants } : {}),
      ...(category ? { category } : {}),
      ...(brand ? { brand } : {}),
      ...(productUrl ? { productUrl } : {}),
    };
  });

  const orders: OrderRecord[] = ordersRows.map((row) => {
    const storeId = str(row["store_id"]);
    const productId = row["product_id"] ? str(row["product_id"]) : null;
    const recordType = row["record_type"];
    const note = str(row["note"]);
    const noteTs = extractTrendyolTimestampsFromNote(note);
    const directOrderedMs = parseTimestampMs(row["ordered_at"]);
    const directApprovedMs = parseTimestampMs(row["approved_at"]);
    const orderedAt = directOrderedMs != null ? new Date(directOrderedMs).toISOString() : noteTs.orderedAt;
    const approvedAt = directApprovedMs != null ? new Date(directApprovedMs).toISOString() : noteTs.approvedAt;
    return {
      id: localIdFor("order", str(row["id"]), idMap),
      tenantId: session.tenantId,
      storeId: storeIdMap.get(storeId) ?? localIdFor("store", storeId, idMap),
      type: recordType === "return" || recordType === "cancellation" ? recordType : "sale",
      orderNumber: str(row["order_number"]),
      date: str(row["record_date"]),
      ...(orderedAt ? { orderedAt } : {}),
      ...(approvedAt ? { approvedAt } : {}),
      productId: productId ? (productIdMap.get(productId) ?? localIdFor("product", productId, idMap)) : null,
      quantity: Number(row["quantity"]),
      grossAmount: Number(row["gross_amount"]),
      discountAmount: Number(row["discount_amount"]),
      couponAmount: Number(row["coupon_amount"]),
      commissionAmount: Number(row["commission_amount"]),
      shippingAmount: Number(row["shipping_amount"]),
      withholdingAmount: Number(row["withholding_amount"]),
      note,
      source: source(row["data_source"]),
      verified: Boolean(row["verified"]),
      createdAt: str(row["created_at"]),
    };
  });

  const expenses: Expense[] = expensesRows.map((row) => {
    const storeId = row["store_id"] ? str(row["store_id"]) : null;
    return {
      id: localIdFor("expense", str(row["id"]), idMap),
      tenantId: session.tenantId,
      storeId: storeId ? (storeIdMap.get(storeId) ?? localIdFor("store", storeId, idMap)) : null,
      date: str(row["expense_date"]),
      category: str(row["category"]) as Expense["category"],
      amount: Number(row["amount"]),
      description: str(row["description"]),
      source: source(row["data_source"]),
      createdAt: str(row["created_at"]),
    };
  });

  const reconciliations: ReconciliationEntry[] = reconciliationsRows.map((row) => {
    const storeId = str(row["store_id"]);
    return {
      id: localIdFor("reconciliation", str(row["id"]), idMap),
      tenantId: session.tenantId,
      storeId: storeIdMap.get(storeId) ?? localIdFor("store", storeId, idMap),
      period: str(row["period"]),
      totals: {
        grossSales: nullableNum(row["gross_sales"]),
        cancellations: nullableNum(row["cancellations"]),
        returns: nullableNum(row["returns"]),
        discounts: nullableNum(row["discounts"]),
        commission: nullableNum(row["commission"]),
        shipping: nullableNum(row["shipping"]),
        withholding: nullableNum(row["withholding"]),
        netPayout: nullableNum(row["net_payout"]),
      },
      source: source(row["data_source"]),
      note: str(row["note"]),
      createdAt: str(row["created_at"]),
      updatedAt: str(row["updated_at"] ?? row["created_at"]),
    };
  });

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
