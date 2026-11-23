/** Core domain types. Every tenant-owned row carries tenantId; store-owned rows also carry storeId. */

export type Marketplace = "trendyol" | "hepsiburada" | "amazon_tr" | "n11";

/** manual = typed by the user; imported = retrieved from a connected marketplace API. */
export type DataSource = "manual" | "imported";

export type RecordType = "sale" | "return" | "cancellation";

export type ExpenseCategory =
  | "reklam"
  | "kargo"
  | "vergi"
  | "paketleme"
  | "personel"
  | "yazilim"
  | "kira"
  | "diger";

export type ConnectionStatus = "not_connected" | "connected" | "error" | "paused";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  tenantId: string;
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface Store {
  id: string;
  tenantId: string;
  name: string;
  marketplace: Marketplace;
  connectionStatus: ConnectionStatus;
  createdAt: string;
}

/** One marketplace variant (e.g. a size) of a product. Read-only copy of the marketplace catalog. */
export interface ProductVariant {
  id: string;
  barcode: string;
  sku: string;
  /** Attribute values such as size/colour, e.g. "90 x 190". */
  name: string;
  salePrice: number | null;
  listPrice: number | null;
  stock: number;
}

export interface Product {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
  sku: string;
  barcode: string;
  /** Unit cost in TRY, null when the seller has not entered it yet. */
  unitCost: number | null;
  vatRate: number;
  source: DataSource;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
  /** Marketplace main product id (Trendyol contentId) when imported. */
  externalProductId?: string;
  /** Marketplace variants grouped under this main product. Absent for manual products. */
  variants?: ProductVariant[];
}

/**
 * One sale, return or cancellation line.
 * For sale lines all amounts are what happened on the order.
 * For return/cancellation lines grossAmount is the reversed sale amount and
 * discount/coupon/commission/withholding are the amounts reversed back;
 * shippingAmount is always an extra cost (e.g. return shipping).
 */
export interface OrderRecord {
  id: string;
  tenantId: string;
  storeId: string;
  type: RecordType;
  orderNumber: string;
  date: string; // YYYY-MM-DD
  productId: string | null;
  quantity: number;
  grossAmount: number;
  discountAmount: number;
  couponAmount: number;
  commissionAmount: number;
  shippingAmount: number;
  withholdingAmount: number;
  note: string;
  source: DataSource;
  verified: boolean;
  createdAt: string;
}

export interface Expense {
  id: string;
  tenantId: string;
  storeId: string | null; // null = general (all stores)
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  source: DataSource;
  createdAt: string;
}

export interface MarketplaceTotals {
  grossSales: number | null;
  cancellations: number | null;
  returns: number | null;
  discounts: number | null;
  commission: number | null;
  shipping: number | null;
  withholding: number | null;
  netPayout: number | null;
}

export interface ReconciliationEntry {
  id: string;
  tenantId: string;
  storeId: string;
  period: string; // YYYY-MM
  totals: MarketplaceTotals;
  /** Where the marketplace figures came from. Only manual entry exists today. */
  source: DataSource;
  note: string;
  createdAt: string;
  updatedAt: string;
}
