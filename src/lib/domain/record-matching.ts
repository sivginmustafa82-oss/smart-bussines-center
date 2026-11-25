import type { OrderRecord } from "./types";

/** Extracts the Trendyol barcode stored in an imported record's audit note. */
export function recordBarcode(record: Pick<OrderRecord, "note">): string {
  const match = /(?:^|\s\|\s)Barkod:([^|]+)/i.exec(record.note ?? "");
  return (match?.[1] ?? "").trim().toLocaleLowerCase("tr-TR");
}

/**
 * Pair accepted return units to the original order line by order number + barcode.
 * Manual records without barcodes match only other barcode-less records.
 */
export function hasMatchingSaleLine(
  returnRecord: OrderRecord,
  sales: OrderRecord[],
): boolean {
  const barcode = recordBarcode(returnRecord);
  if (!barcode) return false;
  return sales.some(
    (sale) =>
      sale.type === "sale" &&
      sale.orderNumber === returnRecord.orderNumber &&
      recordBarcode(sale) === barcode,
  );
}
