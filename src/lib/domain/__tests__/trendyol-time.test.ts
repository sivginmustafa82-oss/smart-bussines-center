import { describe, expect, it } from "vitest";
import {
  istanbulDayEndEpoch,
  istanbulDayStartEpoch,
  trendyolQueryWindows,
  trendyolReportDateFromEpoch,
} from "../../../../supabase/functions/smart-business-api/trendyol-time.ts";

describe("Trendyol Europe/Istanbul report date handling", () => {
  it("converts UTC timestamps to the correct Istanbul calendar date", () => {
    expect(trendyolReportDateFromEpoch(Date.parse("2026-09-30T20:59:59.999Z"))).toBe("2026-09-30");
    expect(trendyolReportDateFromEpoch(Date.parse("2026-09-30T21:00:00.000Z"))).toBe("2026-10-01");
    expect(trendyolReportDateFromEpoch(Date.parse("2026-10-01T02:23:59.000Z"))).toBe("2026-10-01");
  });

  it("uses Istanbul local midnight and end-of-day as inclusive API boundaries", () => {
    const [window] = trendyolQueryWindows("2026-09-30", "2026-09-30");
    expect(new Date(window.startDate).toISOString()).toBe("2026-09-29T21:00:00.000Z");
    expect(new Date(window.endDate).toISOString()).toBe("2026-09-30T20:59:59.999Z");
    expect(window.startDate).toBe(istanbulDayStartEpoch("2026-09-30"));
    expect(window.endDate).toBe(istanbulDayEndEpoch("2026-09-30"));
  });

  it("keeps adjacent query windows contiguous without overlap", () => {
    const windows = trendyolQueryWindows("2026-09-01", "2026-09-30", 13);
    expect(windows).toHaveLength(3);
    expect(windows[1].startDate).toBe(windows[0].endDate + 1);
    expect(windows[2].startDate).toBe(windows[1].endDate + 1);
  });
});
