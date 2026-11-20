import { z } from "zod";
import type {
  Expense,
  OrderRecord,
  Product,
  ReconciliationEntry,
  Store,
} from "@/lib/domain/types";
import { readDB, readSession, writeDB } from "./local-db";

const id = z.string().min(1).max(200);
const timestamp = z.string().min(1);
const amount = z.number().finite().nonnegative();
const nullableAmount = amount.nullable();

const tenantSchema = z.object({
  id,
  name: z.string().trim().min(2).max(100),
  ownerId: id,
  createdAt: timestamp,
});

const storeSchema = z.object({
  id,
  tenantId: id,
  name: z.string().trim().min(2).max(80),
  marketplace: z.enum(["trendyol", "hepsiburada", "amazon_tr", "n11"]),
  connectionStatus: z.literal("not_connected"),
  createdAt: timestamp,
});

const productSchema = z.object({
  id,
  tenantId: id,
  storeId: id,
  name: z.string().trim().min(2).max(200),
  sku: z.string().max(64),
  barcode: z.string().max(32),
  unitCost: amount.nullable(),
  vatRate: z.union([z.literal(0), z.literal(1), z.literal(10), z.literal(20)]),
  source: z.enum(["manual", "imported"]),
  verified: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const orderSchema = z.object({
  id,
  tenantId: id,
  storeId: id,
  type: z.enum(["sale", "return", "cancellation"]),
  orderNumber: z.string().min(1).max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  productId: id.nullable(),
  quantity: z.number().int().min(1).max(100000),
  grossAmount: amount,
  discountAmount: amount,
  couponAmount: amount,
  commissionAmount: amount,
  shippingAmount: amount,
  withholdingAmount: amount,
  note: z.string().max(300),
  source: z.enum(["manual", "imported"]),
  verified: z.boolean(),
  createdAt: timestamp,
});

const expenseSchema = z.object({
  id,
  tenantId: id,
  storeId: id.nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.enum(["reklam", "kargo", "vergi", "paketleme", "personel", "yazilim", "kira", "diger"]),
  amount,
  description: z.string().max(300),
  source: z.enum(["manual", "imported"]),
  createdAt: timestamp,
});

const reconciliationSchema = z.object({
  id,
  tenantId: id,
  storeId: id,
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  totals: z.object({
    grossSales: nullableAmount,
    cancellations: nullableAmount,
    returns: nullableAmount,
    discounts: nullableAmount,
    commission: nullableAmount,
    shipping: nullableAmount,
    withholding: nullableAmount,
    netPayout: nullableAmount,
  }),
  source: z.enum(["manual", "imported"]),
  note: z.string().max(300),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const backupSchema = z.object({
  exportedAt: timestamp,
  tenant: tenantSchema,
  stores: z.array(storeSchema),
  products: z.array(productSchema),
  orders: z.array(orderSchema),
  expenses: z.array(expenseSchema),
  reconciliations: z.array(reconciliationSchema),
});

function assertUniqueIds<T extends { id: string }>(rows: T[], label: string) {
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) throw new Error(`Yedek dosyasında aynı ${label} kimliği birden fazla kez bulunuyor.`);
    ids.add(row.id);
  }
}

function upsertById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) rows.set(row.id, row);
  return [...rows.values()];
}

/**
 * Imports a JSON backup exported by this app on another origin (e.g. the previous Lovable URL).
 * All records are remapped to the current signed-in local tenant, while stable row IDs and
 * store/product relationships are retained. Existing browser data is merged, never cleared.
 */
export async function importTenantBackupFile(file: File): Promise<{
  stores: number;
  products: number;
  orders: number;
  expenses: number;
  reconciliations: number;
}> {
  const session = readSession();
  if (!session?.cloudOrganizationId || session.authProvider !== "supabase") {
    throw new Error("Önce Supabase hesabınızla giriş yapın; yedek bu hesaba aktarılacak.");
  }
  if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
    throw new Error("JSON yedek dosyası boş veya 15 MB sınırını aşıyor.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error("Dosya geçerli bir JSON yedeği değil.");
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const field = firstIssue?.path.join(".") || "dosya";
    throw new Error(`Yedek dosyasının biçimi tanınmadı (${field}). Smart Bussines Center içinden alınmış JSON yedeğini seçin.`);
  }

  const backup = parsed.data;
  const legacyTenantId = backup.tenant.id;
  const sameTenant = [
    ...backup.stores,
    ...backup.products,
    ...backup.orders,
    ...backup.expenses,
    ...backup.reconciliations,
  ].every((row) => row.tenantId === legacyTenantId);
  if (!sameTenant) throw new Error("Yedek dosyasında farklı çalışma alanlarına ait karışık kayıtlar var.");

  assertUniqueIds(backup.stores, "mağaza");
  assertUniqueIds(backup.products, "ürün");
  assertUniqueIds(backup.orders, "sipariş");
  assertUniqueIds(backup.expenses, "gider");
  assertUniqueIds(backup.reconciliations, "mutabakat");

  const storeIds = new Set(backup.stores.map((store) => store.id));
  const productStore = new Map(backup.products.map((product) => [product.id, product.storeId]));
  if (backup.products.some((product) => !storeIds.has(product.storeId))) {
    throw new Error("Yedekte mağazası bulunmayan ürün var. Kaynak yedeği kontrol edin.");
  }
  if (backup.orders.some((order) => !storeIds.has(order.storeId))) {
    throw new Error("Yedekte mağazası bulunmayan sipariş var. Kaynak yedeği kontrol edin.");
  }
  if (backup.orders.some((order) => order.productId && productStore.get(order.productId) !== order.storeId)) {
    throw new Error("Yedekte başka mağazaya bağlı ürün içeren sipariş var. Kaynak yedeği kontrol edin.");
  }
  if (backup.expenses.some((expense) => expense.storeId && !storeIds.has(expense.storeId))) {
    throw new Error("Yedekte mağazası bulunmayan gider var. Kaynak yedeği kontrol edin.");
  }
  if (backup.reconciliations.some((entry) => !storeIds.has(entry.storeId))) {
    throw new Error("Yedekte mağazası bulunmayan mutabakat var. Kaynak yedeği kontrol edin.");
  }

  const remapTenant = <T extends { tenantId: string }>(rows: T[]) =>
    rows.map((row) => ({ ...row, tenantId: session.tenantId }));

  const importedStores: Store[] = remapTenant(backup.stores);
  const importedProducts: Product[] = remapTenant(backup.products);
  const importedOrders: OrderRecord[] = remapTenant(backup.orders);
  const importedExpenses: Expense[] = remapTenant(backup.expenses);
  const importedReconciliations: ReconciliationEntry[] = remapTenant(backup.reconciliations);

  writeDB((db) => {
    const currentTenant = db.tenants.find((tenant) => tenant.id === session.tenantId);
    const currentUser = db.users.find((user) => user.id === session.userId);
    if (!currentUser) throw new Error("Giriş yapan hesap yerel önbellekte bulunamadı. Tekrar giriş yapın.");

    return {
      ...db,
      tenants: [
        ...db.tenants.filter((tenant) => tenant.id !== session.tenantId),
        {
          id: session.tenantId,
          name: backup.tenant.name || currentTenant?.name || "Çalışma alanı",
          ownerId: currentUser.id,
          createdAt: currentTenant?.createdAt ?? backup.tenant.createdAt,
        },
      ],
      stores: upsertById(db.stores, importedStores),
      products: upsertById(db.products, importedProducts),
      orders: upsertById(db.orders, importedOrders),
      expenses: upsertById(db.expenses, importedExpenses),
      reconciliations: upsertById(db.reconciliations, importedReconciliations),
    };
  });

  return {
    stores: importedStores.length,
    products: importedProducts.length,
    orders: importedOrders.length,
    expenses: importedExpenses.length,
    reconciliations: importedReconciliations.length,
  };
}
