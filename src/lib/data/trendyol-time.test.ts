import { describe, expect, it } from "vitest";
import {
  extractTrendyolTimestampsFromNote,
  istanbulDateFromTimestamp,
  istanbulDayStartEpoch,
  istanbulMonthRange,
  istanbulNextDayStartEpoch,
  istanbulRangeBounds,
  isDateOnlyInIstanbulRange,
  isTimestampInIstanbulRange,
  parseTimestampMs,
} from "../../supabase/functions/smart-business-api/trendyol-time";

describe("Europe/Istanbul report date boundaries", () => {
  it("uses Turkey midnight as the inclusive start and next midnight as exclusive end", () => {
    const bounds = istanbulRangeBounds("2026-10-01", "2026-10-01");
    expect(bounds.startMs).toBe(Date.parse("2026-09-30T21:00:00.000Z"));
    expect(bounds.endExclusiveMs).toBe(Date.parse("2026-10-01T21:00:00.000Z"));
    expect(isTimestampInIstanbulRange(bounds.startMs!, { from: "2026-10-01", to: "2026-10-01" })).toBe(true);
    expect(isTimestampInIstanbulRange(bounds.endExclusiveMs!, { from: "2026-10-01", to: "2026-10-01" })).toBe(false);
  });

  it("assigns 02:23 and 02:43 Turkey orders to October 1, not September 30", () => {
    const order1 = Date.parse("2026-09-30T23:23:00.000Z");
    const order2 = Date.parse("2026-09-30T23:43:00.000Z");
    expect(istanbulDateFromTimestamp(order1)).toBe("2026-10-01");
    expect(istanbulDateFromTimestamp(order2)).toBe("2026-10-01");
    expect(isTimestampInIstanbulRange(order1, { from: "2026-10-01", to: "2026-10-01" })).toBe(true);
    expect(isTimestampInIstanbulRange(order1, { from: "2026-09-01", to: "2026-09-30" })).toBe(false);
  });

  it("keeps date-only values unchanged and never fabricates a timestamp", () => {
    expect(parseTimestampMs("2026-10-01")).toBeNull();
    expect(istanbulDateFromTimestamp("2026-10-01")).toBe("2026-10-01");
    expect(isDateOnlyInIstanbulRange("2026-10-01", { from: "2026-10-01", to: "2026-10-01" })).toBe(true);
    expect(isDateOnlyInIstanbulRange("2026-09-30", { from: "2026-10-01", to: "2026-10-01" })).toBe(false);
  });

  it("creates correct month bounds across September and October", () => {
    const september = istanbulMonthRange("2026-09");
    const october = istanbulMonthRange("2026-10");
    expect(september.startMs).toBe(istanbulDayStartEpoch("2026-09-01"));
    expect(september.endExclusiveMs).toBe(istanbulDayStartEpoch("2026-10-01"));
    expect(october.startMs).toBe(september.endExclusiveMs);
    expect(october.endExclusiveMs).toBe(istanbulNextDayStartEpoch("2026-10-31"));
  });

  it("keeps original order time and return approval time distinct", () => {
    const times = extractTrendyolTimestampsFromNote(
      "Sipariş:2026-09-30T23:23:00Z | Son durum güncelleme: 2026-10-02 11:15:00.000 Europe/Istanbul",
    );
    expect(times.orderedAt).toBe("2026-09-30T23:23:00.000Z");
    expect(times.approvedAt).toBe("2026-10-02T08:15:00.000Z");
  });
});
