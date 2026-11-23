import { RECORD_TYPE_LABELS } from "./labels";
import type { OrderRecord, Product, Store } from "./types";

export const ORDER_EXPORT_COLUMNS = [
  "Tarih",
  "Sipariş No",
  "Tür",
  "Mağaza",
  "Ürün",
  "Miktar",
  "Brüt (₺)",
  "Satıcı indirimi (₺)",
  "Kupon (₺)",
  "Komisyon (₺)",
  "Kargo (₺)",
  "Stopaj (₺)",
  "Kaynak",
  "Not",
] as const;

export type OrderExportRow = [
  date: string,
  orderNumber: string,
  type: string,
  store: string,
  product: string,
  quantity: number,
  gross: number,
  sellerDiscount: number,
  coupon: number,
  commission: number,
  shipping: number,
  withholding: number,
  source: string,
  note: string,
];

export function sourceLabel(r: Pick<OrderRecord, "source" | "verified">): string {
  if (r.source === "imported") return r.verified ? "Doğrulanmış (içe aktarıldı)" : "İçe aktarıldı";
  return "Manuel";
}

/** Rows exactly as shown (already filtered and sorted by the caller). Dates stay YYYY-MM-DD. */
export function buildOrderExportRows(records: OrderRecord[], stores: Store[], products: Product[]): OrderExportRow[] {
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const productName = new Map(products.map((p) => [p.id, p.name]));
  return records.map((r) => [
    r.date,
    r.orderNumber,
    RECORD_TYPE_LABELS[r.type],
    storeName.get(r.storeId) ?? "—",
    r.productId ? (productName.get(r.productId) ?? "Ürün bulunamadı") : "Ürün bağlanmadı",
    r.quantity,
    r.grossAmount,
    r.discountAmount,
    r.couponAmount,
    r.commissionAmount,
    r.shippingAmount,
    r.withholdingAmount,
    sourceLabel(r),
    r.note,
  ]);
}
