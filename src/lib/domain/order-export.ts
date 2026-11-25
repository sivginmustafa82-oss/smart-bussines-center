import { RECORD_TYPE_LABELS } from "./labels";
import { recordApprovedAt, recordIstanbulDate, recordOrderedAt } from "./profitability";
import type { OrderRecord, Product, Store } from "./types";
import {
  istanbulDateTimeFromEpoch,
  istanbulTimeFromEpoch,
  parseTimestampMs,
} from "../../../supabase/functions/smart-business-api/trendyol-time";

export const ORDER_EXPORT_COLUMNS = [
  "Tarih (TR)",
  "Sipariş Saati (UTC+3)",
  "İade Onay Zamanı (UTC+3)",
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
  orderTimeTr: string,
  returnApprovedAtTr: string,
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

/**
 * Rows exactly as shown (already filtered and sorted by the caller).
 * Dates follow Europe/Istanbul (YYYY-MM-DD). Time columns stay empty ("") for date-only rows;
 * no fake "00:00" time is ever exported.
 */
export function buildOrderExportRows(records: OrderRecord[], stores: Store[], products: Product[]): OrderExportRow[] {
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const productName = new Map(products.map((p) => [p.id, p.name]));
  return records.map((r) => {
    const orderedMs = parseTimestampMs(recordOrderedAt(r));
    const approvedMs = parseTimestampMs(recordApprovedAt(r));
    return [
      recordIstanbulDate(r),
      orderedMs != null ? istanbulTimeFromEpoch(orderedMs, true) : "",
      approvedMs != null ? istanbulDateTimeFromEpoch(approvedMs).slice(0, 19) : "",
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
    ];
  });
}
