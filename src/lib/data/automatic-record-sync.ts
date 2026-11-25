import { supabase } from "@/integrations/supabase/client";
import type { Expense, OrderRecord, ReconciliationEntry } from "@/lib/domain/types";
import { readDB, readSession, subscribe, writeDB } from "./local-db";
import { clearPendingRecordEdits, getPendingRecordEdits, persistCloudIdMap, scoped } from "./repo";
import {
  extractTrendyolTimestampsFromNote,
  parseTimestampMs,
} from "../../../supabase/functions/smart-business-api/trendyol-time";

type Row = Record<string, unknown>;
const str = (value: unknown): string => (typeof value === "string" ? value : String(value ?? ""));
const nullableNum = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const MAP_PREFIX = "sbc:v1:cloud-id-map:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readIdMap(tenantId: string): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(MAP_PREFIX + tenantId) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function cloudIdFor(kind: string, localId: string, map: Record<string, string>) {
  const key = kind + ":" + localId;
  if (map[key] && UUID_RE.test(map[key])) return map[key];
  const id = UUID_RE.test(localId) ? localId : crypto.randomUUID();
  map[key] = id;
  return id;
}

function localIdFor(kind: string, cloudId: string, map: Record<string, string>) {
  const entry = Object.entries(map).find(([key, value]) => key.startsWith(kind + ":") && value === cloudId);
  return entry ? entry[0].slice(kind.length + 1) : cloudId;
}

async function readRows(table: "order_records" | "expenses" | "reconciliations", organizationId: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(table).select("*").eq("organization_id", organizationId).range(offset, offset + 999);
    if (error) throw new Error("Otomatik eşitleme okunamadı (" + table + "): " + error.message);
    const batch = (data ?? []) as Row[];
    all.push(...batch);
    if (batch.length < 1000) return all;
  }
}

export async function syncBusinessRecordsAutomatically(): Promise<void> {
  const session = readSession();
  if (!session?.cloudOrganizationId || session.authProvider !== "supabase") return;
  const tenantId = session.tenantId;
  const organizationId = session.cloudOrganizationId;
  if (!window.localStorage.getItem("sbc:v1:cloud-sync:" + tenantId)) return;

  const map = readIdMap(tenantId);
  const pending = getPendingRecordEdits(tenantId);
  const snapshot = scoped(readDB(), tenantId);
  const stores = new Map(snapshot.stores.map((store) => [store.id, map["store:" + store.id] || store.id]));
  const products = new Map(snapshot.products.map((product) => [product.id, map["product:" + product.id] || product.id]));
  const uploaded: Record<string, string> = {};

  const orderRows = snapshot.orders
    .filter((row) => row.source === "manual" && pending["order:" + row.id])
    .map((row: OrderRecord) => {
      const storeId = stores.get(row.storeId);
      if (!storeId) throw new Error("Siparişin mağaza bulut eşlemesi bulunamadı.");
      return {
        id: cloudIdFor("order", row.id, map),
        organization_id: organizationId,
        store_id: storeId,
        record_type: row.type,
        order_number: row.orderNumber,
        record_date: row.date,
        product_id: row.productId ? (products.get(row.productId) ?? null) : null,
        quantity: row.quantity,
        gross_amount: row.grossAmount,
        discount_amount: row.discountAmount,
        coupon_amount: row.couponAmount,
        commission_amount: row.commissionAmount,
        shipping_amount: row.shippingAmount,
        withholding_amount: row.withholdingAmount,
        note: row.note,
        data_source: "manual",
        verified: row.verified,
        created_at: row.createdAt,
      };
    });
  const expenseRows = snapshot.expenses.filter((row) => row.source === "manual" && pending["expense:" + row.id]).map((row: Expense) => ({
    id: cloudIdFor("expense", row.id, map),
    organization_id: organizationId,
    store_id: row.storeId ? stores.get(row.storeId) ?? null : null,
    expense_date: row.date,
    category: row.category,
    description: row.description,
    amount: row.amount,
    currency: "TRY",
    data_source: "manual",
    created_at: row.createdAt,
  }));
  const reconciliationRows = snapshot.reconciliations
    .filter((row) => row.source === "manual" && pending["reconciliation:" + row.id])
    .map((row: ReconciliationEntry) => {
      const storeId = stores.get(row.storeId);
      if (!storeId) throw new Error("Mutabakatın mağaza bulut eşlemesi bulunamadı.");
      return {
        id: cloudIdFor("reconciliation", row.id, map),
        organization_id: organizationId,
        store_id: storeId,
        period: row.period,
        gross_sales: row.totals.grossSales,
        cancellations: row.totals.cancellations,
        returns: row.totals.returns,
        discounts: row.totals.discounts,
        commission: row.totals.commission,
        shipping: row.totals.shipping,
        withholding: row.totals.withholding,
        net_payout: row.totals.netPayout,
        note: row.note,
        data_source: "manual",
        created_at: row.createdAt,
      };
    });
  persistCloudIdMap(tenantId, map);

  for (let offset = 0; offset < orderRows.length; offset += 100) {
    const batch = orderRows.slice(offset, offset + 100);
    const { error } = await supabase.from("order_records").upsert(batch, { onConflict: "id" });
    if (error) throw new Error("Sipariş kaydı eşitlenemedi: " + error.message);
  }
  for (let offset = 0; offset < expenseRows.length; offset += 100) {
    const batch = expenseRows.slice(offset, offset + 100);
    const { error } = await supabase.from("expenses").upsert(batch, { onConflict: "id" });
    if (error) throw new Error("Gider eşitlenemedi: " + error.message);
  }
  for (let offset = 0; offset < reconciliationRows.length; offset += 100) {
    const batch = reconciliationRows.slice(offset, offset + 100);
    const { error } = await supabase.from("reconciliations").upsert(batch, { onConflict: "id" });
    if (error) throw new Error("Mutabakat eşitlenemedi: " + error.message);
  }

  for (const row of snapshot.orders) {
    const version = pending["order:" + row.id];
    if (version && row.source === "manual") uploaded["order:" + row.id] = version;
  }
  for (const row of snapshot.expenses) {
    const version = pending["expense:" + row.id];
    if (version && row.source === "manual") uploaded["expense:" + row.id] = version;
  }
  for (const row of snapshot.reconciliations) {
    const version = pending["reconciliation:" + row.id];
    if (version && row.source === "manual") uploaded["reconciliation:" + row.id] = version;
  }
  clearPendingRecordEdits(tenantId, uploaded);

  const [remoteOrders, remoteExpenses, remoteReconciliations] = await Promise.all([
    readRows("order_records", organizationId),
    readRows("expenses", organizationId),
    readRows("reconciliations", organizationId),
  ]);

  const current = scoped(readDB(), tenantId);
  const currentPending = getPendingRecordEdits(tenantId);
  const incomingOrders: OrderRecord[] = remoteOrders.map((row) => {
    const recordType = row["record_type"];
    const note = str(row["note"]);
    const noteTs = extractTrendyolTimestampsFromNote(note);
    const directOrderedMs = parseTimestampMs(row["ordered_at"]);
    const directApprovedMs = parseTimestampMs(row["approved_at"]);
    const orderedAt = directOrderedMs != null ? new Date(directOrderedMs).toISOString() : noteTs.orderedAt;
    const approvedAt = directApprovedMs != null ? new Date(directApprovedMs).toISOString() : noteTs.approvedAt;
    return {
      id: localIdFor("order", str(row["id"]), map),
      tenantId,
      storeId: localIdFor("store", str(row["store_id"]), map),
      type: recordType === "return" || recordType === "cancellation" ? recordType : "sale",
      orderNumber: str(row["order_number"]),
      date: str(row["record_date"]),
      ...(orderedAt ? { orderedAt } : {}),
      ...(approvedAt ? { approvedAt } : {}),
      productId: row["product_id"] ? localIdFor("product", str(row["product_id"]), map) : null,
      quantity: Number(row["quantity"]),
      grossAmount: Number(row["gross_amount"]),
      discountAmount: Number(row["discount_amount"]),
      couponAmount: Number(row["coupon_amount"]),
      commissionAmount: Number(row["commission_amount"]),
      shippingAmount: Number(row["shipping_amount"]),
      withholdingAmount: Number(row["withholding_amount"]),
      note,
      source: row["data_source"] === "imported" ? "imported" : "manual",
      verified: Boolean(row["verified"]),
      createdAt: str(row["created_at"]),
    };
  });
  const incomingExpenses: Expense[] = remoteExpenses.map((row) => ({
    id: localIdFor("expense", str(row["id"]), map),
    tenantId,
    storeId: row["store_id"] ? localIdFor("store", str(row["store_id"]), map) : null,
    date: str(row["expense_date"]),
    category: str(row["category"]) as Expense["category"],
    amount: Number(row["amount"]),
    description: str(row["description"]),
    source: row["data_source"] === "imported" ? "imported" : "manual",
    createdAt: str(row["created_at"]),
  }));
  const incomingReconciliations: ReconciliationEntry[] = remoteReconciliations.map((row) => ({
    id: localIdFor("reconciliation", str(row["id"]), map),
    tenantId,
    storeId: localIdFor("store", str(row["store_id"]), map),
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
    source: row["data_source"] === "imported" ? "imported" : "manual",
    note: str(row["note"]),
    createdAt: str(row["created_at"]),
    updatedAt: str(row["updated_at"] ?? row["created_at"]),
  }));

  for (const row of incomingOrders) {
    if (!map["order:" + row.id]) {
      const found = remoteOrders.find((r) => localIdFor("order", str(r["id"]), map) === row.id);
      map["order:" + row.id] = found ? str(found["id"]) : row.id;
    }
  }
  for (const row of incomingExpenses) {
    if (!map["expense:" + row.id]) {
      const found = remoteExpenses.find((r) => localIdFor("expense", str(r["id"]), map) === row.id);
      map["expense:" + row.id] = found ? str(found["id"]) : row.id;
    }
  }
  for (const row of incomingReconciliations) {
    if (!map["reconciliation:" + row.id]) {
      const found = remoteReconciliations.find((r) => localIdFor("reconciliation", str(r["id"]), map) === row.id);
      map["reconciliation:" + row.id] = found ? str(found["id"]) : row.id;
    }
  }
  persistCloudIdMap(tenantId, map);

  const merge = <T extends { id: string }>(localRows: T[], remoteRows: T[], kind: string): T[] => {
    const byId = new Map(localRows.map((row) => [row.id, row]));
    for (const remote of remoteRows) {
      if (currentPending[kind + ":" + remote.id]) continue;
      byId.set(remote.id, remote);
    }
    return [...byId.values()];
  };
  const nextOrders = merge(current.orders, incomingOrders, "order");
  const nextExpenses = merge(current.expenses, incomingExpenses, "expense");
  const nextReconciliations = merge(current.reconciliations, incomingReconciliations, "reconciliation");
  if (
    JSON.stringify(current.orders) !== JSON.stringify(nextOrders) ||
    JSON.stringify(current.expenses) !== JSON.stringify(nextExpenses) ||
    JSON.stringify(current.reconciliations) !== JSON.stringify(nextReconciliations)
  ) {
    writeDB((db) => ({
      ...db,
      orders: [...db.orders.filter((row) => row.tenantId !== tenantId), ...nextOrders],
      expenses: [...db.expenses.filter((row) => row.tenantId !== tenantId), ...nextExpenses],
      reconciliations: [...db.reconciliations.filter((row) => row.tenantId !== tenantId), ...nextReconciliations],
    }));
  }

  window.localStorage.setItem("sbc:v1:auto-record-sync:" + tenantId, JSON.stringify({
    syncedAt: new Date().toISOString(), orders: incomingOrders.length,
    expenses: incomingExpenses.length, reconciliations: incomingReconciliations.length,
    pushed: Object.keys(uploaded).length,
  }));
}

let active = false;
export function startAutomaticRecordSync(): () => void {
  if (typeof window === "undefined" || active) return () => {};
  active = true;
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let rerun = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if (stopped || document.visibilityState === "hidden" || !navigator.onLine) return;
    if (inFlight) { rerun = true; return; }
    inFlight = syncBusinessRecordsAutomatically()
      .catch((error) => console.warn("[AutoSync] Business records deferred:", error))
      .finally(() => {
        inFlight = null;
        if (rerun && !stopped) { rerun = false; run(); }
      });
  };
  const scheduleDirtyPush = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const session = readSession();
      if (session && Object.keys(getPendingRecordEdits(session.tenantId)).length) run();
    }, 250);
  };
  const unsubscribe = subscribe(scheduleDirtyPush);
  const interval = window.setInterval(run, 5_000);
  const onOnline = () => run();
  const onVisibility = () => { if (document.visibilityState === "visible") run(); };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  const session = readSession();
  const realtime = session?.cloudOrganizationId && session.authProvider === "supabase"
    ? supabase.channel("auto-business-record-sync:" + session.tenantId)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_records", filter: "organization_id=eq." + session.cloudOrganizationId }, () => run())
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: "organization_id=eq." + session.cloudOrganizationId }, () => run())
      .on("postgres_changes", { event: "*", schema: "public", table: "reconciliations", filter: "organization_id=eq." + session.cloudOrganizationId }, () => run())
      .subscribe((status) => { if (status === "SUBSCRIBED") run(); })
    : null;
  run();
  return () => {
    stopped = true; active = false; unsubscribe();
    if (debounce) clearTimeout(debounce);
    window.clearInterval(interval);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    if (realtime) void supabase.removeChannel(realtime);
  };
}
