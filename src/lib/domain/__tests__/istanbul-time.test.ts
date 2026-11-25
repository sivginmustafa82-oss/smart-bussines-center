import { describe, expect, it } from "vitest";
import {
  extractTrendyolTimestampsFromNote,
  isDateOnlyInIstanbulRange,
  isTimestampInIstanbulRange,
  istanbulDateFromEpoch,
  istanbulDateFromTimestamp,
  istanbulDayStartEpoch,
  istanbulIsoFromEpoch,
  istanbulMonthRange,
  istanbulNextDayStartEpoch,
  istanbulRangeBounds,
  trendyolQueryWindows,
} from "../../../../supabase/functions/smart-business-api/trendyol-time";
import {
  activePeriods,
  calculateProfit,
  filterExpenses,
  filterRecords,
  isOrderInRange,
  periodRange,
  recordApprovedAt,
  recordIstanbulDate,
  recordOrderedAt,
} from "../profitability";
import { calculateSalesSummary } from "../sales-summary";
import { buildOrderExportRows } from "../order-export";
import { appTotalsForReconciliation, compareTotals } from "../reconciliation";
import { formatDate, formatIstanbulDateTime, formatIstanbulTime } from "@/lib/format";
import { presetRange } from "@/components/app/filters";
import type { Expense, OrderRecord, Product, Store } from "../types";

const store: Store = {
  id: "s1",
  tenantId: "t1",
  name: "Trendyol Ana Mağaza",
  marketplace: "trendyol",
  connectionStatus: "connected",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const products: Product[] = [
  {
    id: "p1",
    tenantId: "t1",
    storeId: "s1",
    name: "Yatak 90x190",
    sku: "YTK-90",
    barcode: "8680001",
    unitCost: 400,
    vatRate: 20,
    source: "imported",
    verified: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
];

const mkOrder = (p: Partial<OrderRecord>): OrderRecord => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  tenantId: "t1",
  storeId: "s1",
  type: "sale",
  orderNumber: "ORD-1",
  date: "2026-09-30",
  productId: "p1",
  quantity: 1,
  grossAmount: 1000,
  discountAmount: 100,
  couponAmount: 0,
  commissionAmount: 150,
  shippingAmount: 50,
  withholdingAmount: 10,
  note: "",
  source: "imported",
  verified: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  ...p,
});

const mkExpense = (p: Partial<Expense>): Expense => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  tenantId: "t1",
  storeId: "s1",
  date: "2026-09-30",
  category: "reklam",
  amount: 200,
  description: "Reklam",
  source: "manual",
  createdAt: "2026-09-30T22:30:00.000Z",
  ...p,
});

describe("Europe/Istanbul UTC+3 sınırları ve yarı açık aralıklar", () => {
  it("30 Eylül 23:59:59.999 UTC ile 1 Ekim 00:00 Türkiye sınırını doğru ayırır", () => {
    const oct1TrMidnight = istanbulDayStartEpoch("2026-10-01");
    expect(new Date(oct1TrMidnight).toISOString()).toBe("2026-09-30T21:00:00.000Z");

    const sep30TrLastMs = oct1TrMidnight - 1; // 2026-09-30 23:59:59.999 TR = 20:59:59.999 UTC
    expect(istanbulDateFromEpoch(sep30TrLastMs)).toBe("2026-09-30");
    expect(istanbulDateFromEpoch(oct1TrMidnight)).toBe("2026-10-01");

    const sep30UtcEnd = Date.parse("2026-09-30T23:59:59.999Z"); // 2026-10-01 02:59:59.999 TR
    expect(istanbulDateFromEpoch(sep30UtcEnd)).toBe("2026-10-01");

    const sepRange = istanbulMonthRange("2026-09");
    expect(new Date(sepRange.startMs).toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(new Date(sepRange.endExclusiveMs).toISOString()).toBe("2026-09-30T21:00:00.000Z");

    expect(isTimestampInIstanbulRange(sep30TrLastMs, sepRange)).toBe(true);
    expect(isTimestampInIstanbulRange(oct1TrMidnight, sepRange)).toBe(false);
    expect(isTimestampInIstanbulRange(sep30UtcEnd, sepRange)).toBe(false);
    expect(isTimestampInIstanbulRange(sep30UtcEnd, istanbulMonthRange("2026-10"))).toBe(true);
  });

  it("1 Ekim 02:23 ve 02:43 Türkiye saatli Trendyol siparişlerini Eylül raporuna almaz, Ekim raporuna alır", () => {
    // 2026-10-01 02:23:00 TR = 2026-09-30T23:23:00.000Z
    // 2026-10-01 02:43:00 TR = 2026-09-30T23:43:00.000Z
    // Even if a legacy row carried UTC-shifted date "2026-09-30", orderedAt governs Europe/Istanbul placement.
    const sepOrder = mkOrder({
      id: "sep-late",
      orderNumber: "TY-SEP-2355",
      date: "2026-09-30",
      orderedAt: "2026-09-30T20:55:00.000Z", // 2026-09-30 23:55 TR
      grossAmount: 1000,
    });
    const oct0223 = mkOrder({
      id: "oct-0223",
      orderNumber: "TY-OCT-0223",
      date: "2026-09-30", // simulated UTC-shifted stored date
      orderedAt: "2026-09-30T23:23:00.000Z", // 2026-10-01 02:23 TR
      grossAmount: 2000,
    });
    const oct0243 = mkOrder({
      id: "oct-0243",
      orderNumber: "TY-OCT-0243",
      date: "2026-09-30", // simulated UTC-shifted stored date
      note: "Paket:999 | Durum:Delivered | Satır:1 | Sipariş:2026-10-01T02:43:00+03:00",
      grossAmount: 3000,
    });
    const all = [sepOrder, oct0223, oct0243];

    expect(recordIstanbulDate(sepOrder)).toBe("2026-09-30");
    expect(recordIstanbulDate(oct0223)).toBe("2026-10-01");
    expect(recordIstanbulDate(oct0243)).toBe("2026-10-01");
    expect(formatIstanbulTime(recordOrderedAt(oct0223))).toBe("02:23");
    expect(formatIstanbulTime(recordOrderedAt(oct0243))).toBe("02:43");

    const sepRecords = filterRecords(all, { storeId: "all", ...periodRange("2026-09") });
    const octRecords = filterRecords(all, { storeId: "all", ...periodRange("2026-10") });

    expect(sepRecords.map((r) => r.orderNumber)).toEqual(["TY-SEP-2355"]);
    expect(octRecords.map((r) => r.orderNumber)).toEqual(["TY-OCT-0223", "TY-OCT-0243"]);

    // Store summary (gross/net sales)
    expect(calculateSalesSummary(sepRecords).gross.amount).toBe(1000);
    expect(calculateSalesSummary(octRecords).gross.amount).toBe(5000);

    // Profitability & activePeriods
    expect(calculateProfit(sepRecords, [], products).grossSales).toBe(1000);
    expect(calculateProfit(octRecords, [], products).grossSales).toBe(5000);
    expect(activePeriods(all, [])).toEqual(["2026-10", "2026-09"]);

    // Reconciliation
    const sepProfit = calculateProfit(sepRecords, [], products);
    const sepRecon = appTotalsForReconciliation(sepProfit, {
      shipping: sepProfit.shipping,
      withholding: sepProfit.taxes,
    });
    expect(sepRecon.grossSales).toBe(1000);
    const reconRows = compareTotals(sepRecon, {
      grossSales: 1000, cancellations: 0, returns: 0, discounts: 100,
      commission: 150, shipping: 50, withholding: 10, netPayout: 690,
    });
    expect(reconRows.every((row) => row.status === "match")).toBe(true);
  });

  it("ay başı/sonu (Şubat, artık yıl, yıl sonu) ve ardışık gün aralıklarında örtüşme veya boşluk bırakmaz", () => {
    expect(istanbulMonthRange("2026-02")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(istanbulMonthRange("2028-02")).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });

    const dec31EndTr = Date.parse("2026-12-31T20:59:59.999Z"); // 2026-12-31 23:59:59.999 TR
    const jan1StartTr = Date.parse("2026-12-31T21:00:00.000Z"); // 2027-01-01 00:00:00.000 TR
    expect(isTimestampInIstanbulRange(dec31EndTr, istanbulMonthRange("2026-12"))).toBe(true);
    expect(isTimestampInIstanbulRange(jan1StartTr, istanbulMonthRange("2026-12"))).toBe(false);
    expect(isTimestampInIstanbulRange(jan1StartTr, istanbulMonthRange("2027-01"))).toBe(true);

    // Consecutive single-day half-open ranges [day1 00:00, day2 00:00) and [day2 00:00, day3 00:00)
    const day1 = istanbulRangeBounds("2026-09-30", "2026-09-30");
    const day2 = istanbulRangeBounds("2026-10-01", "2026-10-01");
    expect(day1.endExclusiveMs).toBe(day2.startMs);

    const exactBoundary = day2.startMs!;
    expect(isTimestampInIstanbulRange(exactBoundary - 1, { from: "2026-09-30", to: "2026-09-30" })).toBe(true);
    expect(isTimestampInIstanbulRange(exactBoundary, { from: "2026-09-30", to: "2026-09-30" })).toBe(false);
    expect(isTimestampInIstanbulRange(exactBoundary, { from: "2026-10-01", to: "2026-10-01" })).toBe(true);

    // Trendyol API windows remain contiguous across the whole month
    const windows = trendyolQueryWindows("2026-09-01", "2026-09-30", 13);
    expect(windows).toHaveLength(3);
    expect(windows[0]!.endExclusiveDate).toBe(windows[1]!.startDate);
    expect(windows[1]!.endExclusiveDate).toBe(windows[2]!.startDate);
    expect(windows[2]!.endExclusiveDate).toBe(istanbulNextDayStartEpoch("2026-09-30"));

    // Preset ranges in Istanbul (2026-10-01 00:30 TR = 2026-09-30T21:30:00.000Z)
    const oct1EarlyTr = Date.parse("2026-09-30T21:30:00.000Z");
    expect(presetRange("this_month", { from: "", to: "" }, oct1EarlyTr)).toEqual({
      from: "2026-10-01",
      to: "2026-10-01",
    });
    expect(presetRange("last_month", { from: "", to: "" }, oct1EarlyTr)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("tarih-only kayıtlarda sahte saat uydurmaz ve gün kaydırmaz", () => {
    const manualOrder = mkOrder({
      id: "manual-1",
      date: "2026-09-30",
      source: "manual",
      note: "Elle girildi",
    });
    const expense = mkExpense({ date: "2026-09-30" });

    expect(recordOrderedAt(manualOrder)).toBeUndefined();
    expect(recordApprovedAt(manualOrder)).toBeUndefined();
    expect(formatIstanbulTime("2026-09-30")).toBeNull();
    expect(formatIstanbulDateTime("2026-09-30")).toBeNull();
    expect(istanbulDateFromTimestamp("2026-09-30")).toBe("2026-09-30");
    expect(formatDate("2026-09-30T23:23:00.000Z")).toBe(formatDate("2026-10-01"));

    expect(isDateOnlyInIstanbulRange("2026-09-30", { from: "2026-09-01", to: "2026-09-30" })).toBe(true);
    expect(isDateOnlyInIstanbulRange("2026-10-01", { from: "2026-09-01", to: "2026-09-30" })).toBe(false);
    expect(filterExpenses([expense], { storeId: "all", from: "2026-09-01", to: "2026-09-30" })).toHaveLength(1);
    expect(filterExpenses([expense], { storeId: "all", from: "2026-10-01", to: "2026-10-31" })).toHaveLength(0);

    const exported = buildOrderExportRows([manualOrder], [store], products);
    expect(exported[0]?.[0]).toBe("2026-09-30");
    expect(exported[0]?.[1]).toBe(""); // no fake 00:00:00
    expect(exported[0]?.[2]).toBe("");
  });

  it("iptal ve iade raporlarında orijinal sipariş tarihi ile iade onay tarihini karıştırmaz", () => {
    // Sale placed on 30 Sep 2026 23:50 TR (20:50 UTC)
    const sepSale = mkOrder({
      id: "sale-sep",
      type: "sale",
      orderNumber: "ORD-SEP-1",
      date: "2026-09-30",
      orderedAt: "2026-09-30T20:50:00.000Z",
      grossAmount: 1000,
      discountAmount: 100,
    });
    // Return approved on 5 Oct 2026 14:15 TR, tied to ORD-SEP-1 (original order date: 30 Sep TR)
    const sepReturn = mkOrder({
      id: "ret-sep",
      type: "return",
      orderNumber: "ORD-SEP-1",
      date: "2026-09-30",
      orderedAt: "2026-09-30T20:50:00.000Z",
      approvedAt: "2026-10-05T11:15:00.000Z",
      grossAmount: 1000,
      discountAmount: 100,
      note: "Onaylı Trendyol iadesi | Sipariş:2026-09-30T23:50:00+03:00 | Son durum güncelleme: 2026-10-05 14:15:00.000 Europe/Istanbul",
    });
    // Cancellation placed on 1 Oct 2026 02:23 TR (30 Sep 23:23 UTC)
    const octCancel = mkOrder({
      id: "cancel-oct",
      type: "cancellation",
      orderNumber: "ORD-OCT-C1",
      date: "2026-09-30", // even if stored date was UTC-shifted
      orderedAt: "2026-09-30T23:23:00.000Z", // 2026-10-01 02:23 TR
      grossAmount: 500,
      discountAmount: 50,
    });

    const extracted = extractTrendyolTimestampsFromNote(sepReturn.note);
    expect(extracted.orderedAt).toBe("2026-09-30T20:50:00.000Z");
    expect(extracted.approvedAt).toBe("2026-10-05T11:15:00.000Z");
    expect(istanbulIsoFromEpoch(Date.parse(extracted.orderedAt!))).toBe("2026-09-30T23:50:00+03:00");

    const all = [sepSale, sepReturn, octCancel];
    const sep = filterRecords(all, { storeId: "all", ...periodRange("2026-09") });
    const oct = filterRecords(all, { storeId: "all", ...periodRange("2026-10") });

    // September gets the sale + its return (original order date 30 Sep TR), NOT the 1 Oct 02:23 TR cancellation
    expect(sep.map((r) => r.id)).toEqual(["sale-sep", "ret-sep"]);
    expect(calculateSalesSummary(sep).returns.amount).toBe(1000);
    expect(calculateSalesSummary(sep).cancellations.amount).toBe(0);
    expect(calculateProfit(sep, [], products).returns).toBe(1000);
    expect(calculateProfit(sep, [], products).cancellations).toBe(0);

    // October gets only the 1 Oct 02:23 TR cancellation (NOT the Sep return whose approval was in Oct)
    expect(oct.map((r) => r.id)).toEqual(["cancel-oct"]);
    expect(calculateSalesSummary(oct).cancellations.amount).toBe(500);
    expect(calculateSalesSummary(oct).returns.amount).toBe(0);
    expect(calculateProfit(oct, [], products).cancellations).toBe(500);
    expect(calculateProfit(oct, [], products).returns).toBe(0);

    // Excel export preserves both timestamps separately in Europe/Istanbul
    const exportedReturn = buildOrderExportRows([sepReturn], [store], products)[0];
    expect(exportedReturn?.[0]).toBe("2026-09-30");
    expect(exportedReturn?.[1]).toBe("23:50:00");
    expect(exportedReturn?.[2]).toBe("2026-10-05 14:15:00");

    // isOrderInRange directly verifies boundary behavior
    expect(isOrderInRange(octCancel, periodRange("2026-09"))).toBe(false);
    expect(isOrderInRange(octCancel, periodRange("2026-10"))).toBe(true);
  });
});