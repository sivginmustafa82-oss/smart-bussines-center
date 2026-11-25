import { describe, expect, it } from "vitest";
import { presetRange } from "./filters";

describe("date preset filters use Europe/Istanbul calendar days", () => {
  const custom = { from: "", to: "" };

  it("switches to October 1 when UTC is still September 30", () => {
    const now = Date.parse("2026-09-30T22:30:00.000Z"); // 2026-10-01 01:30 in Istanbul
    expect(presetRange("this_month", custom, now)).toEqual({
      from: "2026-10-01",
      to: "2026-10-01",
    });
    expect(presetRange("this_year", custom, now)).toEqual({
      from: "2026-01-01",
      to: "2026-10-01",
    });
  });

  it("calculates last month at a Turkey-local month boundary", () => {
    const now = Date.parse("2026-10-31T22:30:00.000Z"); // 2026-11-01 01:30 in Istanbul
    expect(presetRange("last_month", custom, now)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("calculates the last 90 calendar days inclusively", () => {
    const now = Date.parse("2026-10-01T00:00:00.000Z"); // 2026-10-01 03:00 in Istanbul
    expect(presetRange("last_90", custom, now)).toEqual({
      from: "2026-07-04",
      to: "2026-10-01",
    });
  });

  it("keeps custom dates exactly as selected", () => {
    expect(presetRange("custom", { from: "2026-09-30", to: "2026-10-01" }, 0)).toEqual({
      from: "2026-09-30",
      to: "2026-10-01",
    });
  });

  it("does not add date limits to all-time reports", () => {
    expect(presetRange("all", custom, Date.parse("2026-10-01T00:00:00.000Z"))).toEqual({
      from: null,
      to: null,
    });
  });
});
