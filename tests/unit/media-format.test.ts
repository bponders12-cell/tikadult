import { describe, expect, it } from "vitest";
import { centsToDollars, dollarsToCents, statusLabel } from "@/lib/media/format";

describe("media format helpers", () => {
  it("converts dollars to cents safely", () => {
    expect(dollarsToCents("4.99")).toBe(499);
    expect(dollarsToCents("5")).toBe(500);
    expect(dollarsToCents("0.1")).toBe(10);
    expect(dollarsToCents("  ")).toBeNull();
    expect(Number.isNaN(dollarsToCents("-1"))).toBe(true);
    expect(Number.isNaN(dollarsToCents("1.234"))).toBe(true);
    expect(Number.isNaN(dollarsToCents("abc"))).toBe(true);
  });

  it("formats cents and statuses", () => {
    expect(centsToDollars(499)).toBe("4.99");
    expect(centsToDollars(null)).toBe("");
    expect(statusLabel("processing", "pending")).toBe("Queued for checks");
    expect(statusLabel("live", "ready")).toBe("Live");
  });
});
