/**
 * Tenant-scoped repository. Every function takes the caller's tenantId and refuses to
 * read or write rows that belong to another tenant or to a store the tenant does not own.
 * A future server implementation must enforce the same rules (RLS) — see docs/veri-modeli.sql.
 */
import type {
  Expense,
  MarketplaceTotals,
  OrderRecord,
  Product,
  ReconciliationEntry,
  Store,
} from "@/lib/domain/types";
import { type DB, newId, nowISO, readDB, writeDB } from "./local-db";

export class OwnershipError extends Error {
  constructor(message = "Bu kayda erişim yetkiniz yok") {
    super(message);
    this.name = "OwnershipError";
  }
}

export function scoped(db: DB, tenantId: string) {
  return {
    stores: db.stores.filter((s) => s.tenantId === tenantId),
    products: db.products.filter((p) => p.tenantId === tenantId),
    orders: db.orders.filter((o) => o.tenantId === tenantId),
    expenses: db.expenses.filter((e) => e.tenantId === tenantId),
    reconciliations: db.reconciliations.filter((r) => r.tenantId === tenantId),
  };
}

function assertStore(db: DB, tenantId: string, storeId: string): Store {
  const store = db.stores.find((s) => s.id === storeId);
  if (!store || store.tenantId !== tenantId) throw new OwnershipError("Mağaza bulunamadı");
  return store;
}

function assertProductInStore(db: DB, tenantId: string, storeId: string, productId: string | null) {
  if (!productId) return;
  const p = db.products.find((x) => x.id === productId);
  if (!p || p.tenantId !== tenantId || p.storeId !== storeId)
    throw new OwnershipError("Ürün bu mağazaya ait değil");
}

function assertOwned<T extends { id: string; tenantId: string }>(rows: T[], tenantId: string, id: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row || row.tenantId !== tenantId) throw new OwnershipError();
  return row;
}

/* ---------- Stores ---------- */

const STORE_DIRTY_KEY = "sbc:v1:pending-store-edits:";
function readPendingStoreEdits(tenantId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORE_DIRTY_KEY + tenantId);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}
function markStoreDirty(tenantId: string, storeId: string) {
  if (typeof window === "undefined") return;
  const pending = readPendingStoreEdits(tenantId);
  pending[storeId] = nowISO();
  window.localStorage.setItem(STORE_DIRTY_KEY + tenantId, JSON.stringify(pending));
}
export function getPendingStoreEdits(tenantId: string): Record<string, string> {
  return readPendingStoreEdits(tenantId);
}
export function clearPendingStoreEdits(tenantId: string, uploaded: Record<string, string>) {
  if (typeof window === "undefined") return;
  const pending = readPendingStoreEdits(tenantId);
  for (const [id, updatedAt] of Object.entries(uploaded)) {
    if (pending[id] === updatedAt) delete pending[id];
  }
  window.localStorage.setItem(STORE_DIRTY_KEY + tenantId, JSON.stringify(pending));
}

export function createStore(tenantId: string, input: { name: string; marketplace: "trendyol" }): Store {
  const store: Store = {
    id: newId(),
    tenantId,
    name: input.name,
    marketplace: input.marketplace,
    connectionStatus: "not_connected",
    createdAt: nowISO(),
  };
  writeDB((db) => ({ ...db, stores: [...db.stores, store] }));
  markStoreDirty(tenantId, store.id);
  return store;
}

export function renameStore(tenantId: string, storeId: string, name: string) {
  writeDB((db) => {
    assertStore(db, tenantId, storeId);
    return { ...db, stores: db.stores.map((s) => (s.id === storeId ? { ...s, name } : s)) };
  });
  markStoreDirty(tenantId, storeId);
}

/** Deletes a store and everything that belongs to it. */
export function deleteStore(tenantId: string, storeId: string) {
  writeDB((db) => {
    assertStore(db, tenantId, storeId);
    return {
      ...db,
      stores: db.stores.filter((s) => s.id !== storeId),
      products: db.products.filter((p) => p.storeId !== storeId),
      orders: db.orders.filter((o) => o.storeId !== storeId),
      expenses: db.expenses.filter((e) => e.storeId !== storeId),
      reconciliations: db.reconciliations.filter((r) => r.storeId !== storeId),
    };
  });
}

/* ---------- Products ---------- */


const PRODUCT_DIRTY_KEY = "sbc:v1:pending-product-edits:";
function readPendingProductEdits(tenantId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(PRODUCT_DIRTY_KEY + tenantId);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}
function markProductDirty(tenantId: string, productId: string, updatedAt: string) {
  if (typeof window === "undefined") return;
  const pending = readPendingProductEdits(tenantId);
  pending[productId] = updatedAt;
  window.localStorage.setItem(PRODUCT_DIRTY_KEY + tenantId, JSON.stringify(pending));
}
export function getPendingProductEdits(tenantId: string): Record<string, string> {
  return readPendingProductEdits(tenantId);
}
export function clearPendingProductEdits(tenantId: string, uploaded: Record<string, string>) {
  if (typeof window === "undefined") return;
  const pending = readPendingProductEdits(tenantId);
  for (const [id, updatedAt] of Object.entries(uploaded)) {
    if (pending[id] === updatedAt) delete pending[id];
  }
  window.localStorage.setItem(PRODUCT_DIRTY_KEY + tenantId, JSON.stringify(pending));
}

export type ProductInput = Pick<Product, "storeId" | "name" | "sku" | "barcode" | "unitCost" | "vatRate">;

export function upsertProduct(tenantId: string, input: ProductInput, id?: string): Product {
  let result!: Product;
  writeDB((db) => {
    assertStore(db, tenantId, input.storeId);
    const dupe = db.products.find(
      (p) => p.storeId === input.storeId && p.sku.toLowerCase() === input.sku.toLowerCase() && p.id !== id,
    );
    if (dupe) throw new Error("Bu mağazada aynı stok koduna sahip bir ürün zaten var");
    if (id) {
      const existing = assertOwned(db.products, tenantId, id);
      result = { ...existing, ...input, updatedAt: nowISO() };
      return { ...db, products: db.products.map((p) => (p.id === id ? result : p)) };
    }
    result = {
      id: newId(),
      tenantId,
      ...input,
      source: "manual",
      verified: false,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    return { ...db, products: [...db.products, result] };
  });
  markProductDirty(tenantId, result.id, result.updatedAt);
  return result;
}

export function setUnitCost(tenantId: string, productId: string, unitCost: number | null) {
  const updatedAt = nowISO();
  writeDB((db) => {
    assertOwned(db.products, tenantId, productId);
    return {
      ...db,
      products: db.products.map((p) => (p.id === productId ? { ...p, unitCost, updatedAt } : p)),
    };
  });
  markProductDirty(tenantId, productId, updatedAt);
}

export function deleteProduct(tenantId: string, productId: string) {
  writeDB((db) => {
    assertOwned(db.products, tenantId, productId);
    return {
      ...db,
      products: db.products.filter((p) => p.id !== productId),
      // Keep order history but detach the product link.
      orders: db.orders.map((o) => (o.productId === productId ? { ...o, productId: null } : o)),
    };
  });
}


/* ---------- record sync dirty markers ---------- */
const RECORD_DIRTY_KEY = "sbc:v1:pending-record-edits:";
type SyncRecordKind = "order" | "expense" | "reconciliation";
function readPendingRecordEdits(tenantId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(RECORD_DIRTY_KEY + tenantId);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}
function markRecordDirty(tenantId: string, kind: SyncRecordKind, recordId: string) {
  if (typeof window === "undefined") return;
  const pending = readPendingRecordEdits(tenantId);
  pending[kind + ":" + recordId] = nowISO();
  window.localStorage.setItem(RECORD_DIRTY_KEY + tenantId, JSON.stringify(pending));
}
export function getPendingRecordEdits(tenantId: string): Record<string, string> {
  return readPendingRecordEdits(tenantId);
}
export function clearPendingRecordEdits(tenantId: string, uploaded: Record<string, string>) {
  if (typeof window === "undefined") return;
  const pending = readPendingRecordEdits(tenantId);
  for (const [id, version] of Object.entries(uploaded)) {
    if (pending[id] === version) delete pending[id];
  }
  window.localStorage.setItem(RECORD_DIRTY_KEY + tenantId, JSON.stringify(pending));
}

/* ---------- Order records ---------- */

export type OrderInput = Omit<OrderRecord, "id" | "tenantId" | "source" | "verified" | "createdAt">;

export function upsertOrder(tenantId: string, input: OrderInput, id?: string): OrderRecord {
  let result!: OrderRecord;
  writeDB((db) => {
    assertStore(db, tenantId, input.storeId);
    assertProductInStore(db, tenantId, input.storeId, input.productId);
    if (id) {
      const existing = assertOwned(db.orders, tenantId, id);
      if (existing.source === "imported") throw new Error("İçe aktarılan kayıtlar düzenlenemez");
      result = { ...existing, ...input };
      return { ...db, orders: db.orders.map((o) => (o.id === id ? result : o)) };
    }
    result = { id: newId(), tenantId, ...input, source: "manual", verified: false, createdAt: nowISO() };
    return { ...db, orders: [...db.orders, result] };
  });
  markRecordDirty(tenantId, "order", result.id);
  return result;
}

export function deleteOrder(tenantId: string, id: string) {
  writeDB((db) => {
    assertOwned(db.orders, tenantId, id);
    return { ...db, orders: db.orders.filter((o) => o.id !== id) };
  });
}

/* ---------- Expenses ---------- */

export type ExpenseInput = Pick<Expense, "storeId" | "date" | "category" | "amount" | "description">;

export function upsertExpense(tenantId: string, input: ExpenseInput, id?: string): Expense {
  let result!: Expense;
  writeDB((db) => {
    if (input.storeId) assertStore(db, tenantId, input.storeId);
    if (id) {
      const existing = assertOwned(db.expenses, tenantId, id);
      result = { ...existing, ...input };
      return { ...db, expenses: db.expenses.map((e) => (e.id === id ? result : e)) };
    }
    result = { id: newId(), tenantId, ...input, source: "manual", createdAt: nowISO() };
    return { ...db, expenses: [...db.expenses, result] };
  });
  if (result.source === "manual") markRecordDirty(tenantId, "expense", result.id);
  return result;
}

export function deleteExpense(tenantId: string, id: string) {
  writeDB((db) => {
    assertOwned(db.expenses, tenantId, id);
    return { ...db, expenses: db.expenses.filter((e) => e.id !== id) };
  });
}

/* ---------- Reconciliation ---------- */

export function saveReconciliation(
  tenantId: string,
  input: { storeId: string; period: string; totals: MarketplaceTotals; note: string },
): ReconciliationEntry {
  let result!: ReconciliationEntry;
  writeDB((db) => {
    assertStore(db, tenantId, input.storeId);
    const existing = db.reconciliations.find(
      (r) => r.tenantId === tenantId && r.storeId === input.storeId && r.period === input.period,
    );
    if (existing) {
      result = { ...existing, totals: input.totals, note: input.note, updatedAt: nowISO() };
      return {
        ...db,
        reconciliations: db.reconciliations.map((r) => (r.id === existing.id ? result : r)),
      };
    }
    result = {
      id: newId(),
      tenantId,
      ...input,
      source: "manual",
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    return { ...db, reconciliations: [...db.reconciliations, result] };
  });
  if (result.source === "manual") markRecordDirty(tenantId, "reconciliation", result.id);
  return result;
}

export function deleteReconciliation(tenantId: string, id: string) {
  writeDB((db) => {
    assertOwned(db.reconciliations, tenantId, id);
    return { ...db, reconciliations: db.reconciliations.filter((r) => r.id !== id) };
  });
}

/* ---------- Workspace ---------- */

export function renameTenant(tenantId: string, name: string) {
  writeDB((db) => ({
    ...db,
    tenants: db.tenants.map((t) => (t.id === tenantId ? { ...t, name } : t)),
  }));
}

export function renameUser(userId: string, name: string) {
  writeDB((db) => ({ ...db, users: db.users.map((u) => (u.id === userId ? { ...u, name } : u)) }));
}

/** Deletes all business data of the tenant (keeps the account). */
export function wipeTenantData(tenantId: string) {
  writeDB((db) => ({
    ...db,
    stores: db.stores.filter((s) => s.tenantId !== tenantId),
    products: db.products.filter((p) => p.tenantId !== tenantId),
    orders: db.orders.filter((o) => o.tenantId !== tenantId),
    expenses: db.expenses.filter((e) => e.tenantId !== tenantId),
    reconciliations: db.reconciliations.filter((r) => r.tenantId !== tenantId),
  }));
}

export function exportTenantData(tenantId: string) {
  const db = readDB();
  return { exportedAt: nowISO(), tenant: db.tenants.find((t) => t.id === tenantId), ...scoped(db, tenantId) };
}
