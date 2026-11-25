import { describe, expect, it } from "vitest";
import { trendyolQueryWindows, trendyolReportDateFromEpoch } from "../../../../supabase/functions/smart-business-api/trendyol-time.ts";

describe("Trendyol +3-hour report date rule", () => {
  it("assigns the first three UTC hours of the next date to the previous report date", () => {
    expect(trendyolReportDateFromEpoch(Date.parse("2026-10-01T02:23:59.000Z"))).toBe("2026-09-30");
    expect(trendyolReportDateFromEpoch(Date.parse("2026-10-01T02:43:44.000Z"))).toBe("2026-09-30");
    expect(trendyolReportDateFromEpoch(Date.parse("2026-10-01T03:00:00.000Z"))).toBe("2026-10-01");
  });

  it("sends inclusive report-day boundaries shifted by +3 hours", () => {
    const [window] = trendyolQueryWindows("2026-09-30", "2026-09-30");
    expect(new Date(window.startDate).toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(new Date(window.endDate).toISOString()).toBe("2026-09-30T23:59:59.999Z");
  });
});
