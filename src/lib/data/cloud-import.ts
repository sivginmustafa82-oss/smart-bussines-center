import { supabase } from "@/integrations/supabase/client";
import type { Expense, OrderRecord, Product, ReconciliationEntry, Store } from "@/lib/domain/types";
import { readDB, readSession } from "./local-db";
import { scoped } from "./repo";

export interface CloudImportResult {
  importedAt: string;
  stores: number;
  products: number;
  expenses: number;
  orders: number;
  reconciliations: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAP_PREFIX = "sbc:v1:cloud-id-map:";

function getIdMap(tenantId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(MAP_PREFIX + tenantId);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveIdMap(tenantId: string, map: Record<string, string>) {
  window.localStorage.setItem(MAP_PREFIX + tenantId, JSON.stringify(map));
}

function cloudId(map: Record<string, string>, kind: string, localId: string): string {
  const key = kind + ":" + localId;
  const existing = map[key];
  if (existing && UUID_RE.test(existing)) return existing;

  const id = UUID_RE.test(localId) ? localId : crypto.randomUUID();
  map[key] = id;
  return id;
}

async function writeBatches<T>(
  label: string,
  rows: T[],
  writer: (batch: T[]) => PromiseLike<{ error: { message: string } | null }>,
) {
  for (let offset = 0; offset < rows.length; offset += 200) {
    const { error } = await writer(rows.slice(offset, offset + 200));
    if (error) throw new Error(label + " aktarımı durdu: " + error.message);
  }
}

const marketplaceName: Record<Store["marketplace"], string> = {
  trendyol: "Trendyol",
  hepsiburada: "Hepsiburada",
  amazon_tr: "Amazon",
  n11: "n11",
};

/**
 * Copies the currently signed-in tenant's browser records into its Supabase organization.
 * Upserts by stable UUIDs, so retrying after a partial failure does not duplicate records.
 * This deliberately does not delete or clear the browser copy.
 */
export async function importLocalWorkspaceToSupabase(): Promise<CloudImportResult> {
  const session = readSession();
  if (!session?.cloudOrganizationId || session.authProvider !== "supabase") {
    throw new Error("Bulut çalışma alanı bulunamadı. Önce Supabase hesabınızla yeniden giriş yapın.");
  }

  const snapshot = scoped(readDB(), session.tenantId);
  const orgId = session.cloudOrganizationId;
  const idMap = getIdMap(session.tenantId);

  const stores = snapshot.stores.map((store) => ({
    id: cloudId(idMap, "store", store.id),
    organization_id: orgId,
    marketplace: marketplaceName[store.marketplace],
    name: store.name,
    country_code: "TR",
    currency: "TRY",
    timezone: "Europe/Istanbul",
    connection_status: store.connectionStatus,
    created_at: store.createdAt,
  }));

  const storeIds = new Map(snapshot.stores.map((store) => [store.id, cloudId(idMap, "store", store.id)]));
  const products = snapshot.products.map((product) => ({
    id: cloudId(idMap, "product", product.id),
    organization_id: orgId,
    store_id: storeIds.get(product.storeId)!,
    title: product.name,
    status: "active",
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  }));

  const variants = snapshot.products.map((product) => ({
    id: cloudId(idMap, "variant", product.id),
    organization_id: orgId,
    product_id: cloudId(idMap, "product", product.id),
    sku: product.sku.trim() || null,
    barcode: product.barcode.trim() || null,
    vat_rate: product.vatRate,
    currency: "TRY",
  }));

  const costs = snapshot.products
    .filter((product) => product.unitCost !== null)
    .map((product) => ({
      id: cloudId(idMap, "cost", product.id),
      organization_id: orgId,
      variant_id: cloudId(idMap, "variant", product.id),
      unit_cost: product.unitCost!,
      currency: "TRY",
      effective_from: (product.updatedAt || product.createdAt).slice(0, 10),
      source: "manual",
    }));

  const productIds = new Map(snapshot.products.map((product) => [product.id, cloudId(idMap, "product", product.id)]));
  const orders = snapshot.orders.map((order: OrderRecord) => ({
    id: cloudId(idMap, "order", order.id),
    organization_id: orgId,
    store_id: storeIds.get(order.storeId)!,
    record_type: order.type,
    order_number: order.orderNumber,
    record_date: order.date,
    product_id: order.productId ? productIds.get(order.productId) ?? null : null,
    quantity: order.quantity,
    gross_amount: order.grossAmount,
    discount_amount: order.discountAmount,
    coupon_amount: order.couponAmount,
    commission_amount: order.commissionAmount,
    shipping_amount: order.shippingAmount,
    withholding_amount: order.withholdingAmount,
    note: order.note,
    created_at: order.createdAt,
  }));

  const expenses = snapshot.expenses.map((expense: Expense) => ({
    id: cloudId(idMap, "expense", expense.id),
    organization_id: orgId,
    store_id: expense.storeId ? storeIds.get(expense.storeId) ?? null : null,
    expense_date: expense.date,
    category: expense.category,
    description: expense.description,
    amount: expense.amount,
    currency: "TRY",
    created_at: expense.createdAt,
  }));

  const reconciliations = snapshot.reconciliations.map((entry: ReconciliationEntry) => ({
    id: cloudId(idMap, "reconciliation", entry.id),
    organization_id: orgId,
    store_id: storeIds.get(entry.storeId)!,
    period: entry.period,
    gross_sales: entry.totals.grossSales,
    cancellations: entry.totals.cancellations,
    returns: entry.totals.returns,
    discounts: entry.totals.discounts,
    commission: entry.totals.commission,
    shipping: entry.totals.shipping,
    withholding: entry.totals.withholding,
    net_payout: entry.totals.netPayout,
    note: entry.note,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  }));

  // Persist stable remapping before the first write, so a retry after a network failure
  // reuses precisely the same remote IDs.
  saveIdMap(session.tenantId, idMap);

  await writeBatches("Mağaza", stores, (batch) => supabase.from("stores").upsert(batch, { onConflict: "id" }));
  await writeBatches("Ürün", products, (batch) => supabase.from("products").upsert(batch, { onConflict: "id" }));
  await writeBatches("Ürün varyantı", variants, (batch) => supabase.from("product_variants").upsert(batch, { onConflict: "id" }));
  await writeBatches("Ürün maliyeti", costs, (batch) => supabase.from("product_costs").upsert(batch, { onConflict: "id" }));
  await writeBatches("Sipariş kaydı", orders, (batch) => supabase.from("order_records").upsert(batch, { onConflict: "id" }));
  await writeBatches("Gider", expenses, (batch) => supabase.from("expenses").upsert(batch, { onConflict: "id" }));
  await writeBatches("Mutabakat", reconciliations, (batch) => supabase.from("reconciliations").upsert(batch, { onConflict: "id" }));

  const result: CloudImportResult = {
    importedAt: new Date().toISOString(),
    stores: stores.length,
    products: products.length,
    expenses: expenses.length,
    orders: orders.length,
    reconciliations: reconciliations.length,
  };
  window.localStorage.setItem("sbc:v1:cloud-import:" + session.tenantId, JSON.stringify(result));
  return result;
}
