import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CREATOR_SHARE_BPS,
  MAX_CREATOR_SHARE_BPS,
  MIN_CREATOR_SHARE_BPS,
  computeSplit,
  isValidCreatorShareBps,
} from "@/lib/payments/split";
import {
  getCreatorShareBps,
  resetMemoryPlatformSettings,
  setCreatorShareBps,
  setMemoryCreatorShareRaw,
} from "@/lib/platform-settings";

describe("split constants", () => {
  it("uses 70-80% bounds with an 80% default", () => {
    expect(MIN_CREATOR_SHARE_BPS).toBe(7000);
    expect(MAX_CREATOR_SHARE_BPS).toBe(8000);
    expect(DEFAULT_CREATOR_SHARE_BPS).toBe(8000);
  });
});

describe("isValidCreatorShareBps", () => {
  it("accepts integers within 7000..8000 inclusive", () => {
    for (const v of [7000, 7500, 7999, 8000]) expect(isValidCreatorShareBps(v)).toBe(true);
  });
  it("rejects out-of-range, non-integer and non-number values", () => {
    for (const v of [6999, 8001, 0, -1, 7500.5, NaN, Infinity, "8000", null, undefined, {}]) {
      expect(isValidCreatorShareBps(v)).toBe(false);
    }
  });
});

describe("computeSplit", () => {
  it("splits an even amount at 80%", () => {
    expect(computeSplit(1000, 8000)).toEqual({
      grossCents: 1000,
      creatorEarningsCents: 800,
      platformFeeCents: 200,
    });
  });

  it("splits at 70%", () => {
    expect(computeSplit(1000, 7000)).toEqual({
      grossCents: 1000,
      creatorEarningsCents: 700,
      platformFeeCents: 300,
    });
  });

  it("floors the creator share and gives the remainder to the platform", () => {
    // 999 * 0.8 = 799.2 -> 799 creator, 200 platform
    expect(computeSplit(999, 8000)).toEqual({
      grossCents: 999,
      creatorEarningsCents: 799,
      platformFeeCents: 200,
    });
    // 1 * 0.7 = 0.7 -> 0 creator, 1 platform
    expect(computeSplit(1, 7000)).toEqual({ grossCents: 1, creatorEarningsCents: 0, platformFeeCents: 1 });
  });

  it("handles a zero gross", () => {
    expect(computeSplit(0, 8000)).toEqual({ grossCents: 0, creatorEarningsCents: 0, platformFeeCents: 0 });
  });

  it("always sums to the gross", () => {
    for (const bps of [7000, 7333, 7777, 8000]) {
      for (let gross = 0; gross <= 500; gross += 7) {
        const s = computeSplit(gross, bps);
        expect(s.creatorEarningsCents + s.platformFeeCents).toBe(gross);
        expect(s.creatorEarningsCents).toBeGreaterThanOrEqual(0);
        expect(s.platformFeeCents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("throws on a non-integer or negative gross", () => {
    expect(() => computeSplit(10.5, 8000)).toThrow();
    expect(() => computeSplit(-1, 8000)).toThrow();
    expect(() => computeSplit(NaN, 8000)).toThrow();
  });

  it("throws on an out-of-range or non-integer share", () => {
    expect(() => computeSplit(1000, 6999)).toThrow();
    expect(() => computeSplit(1000, 8001)).toThrow();
    expect(() => computeSplit(1000, 7500.5)).toThrow();
  });
});

describe("platform settings: creator share (in-memory backing)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetMemoryPlatformSettings();
  });

  it("defaults to 8000 when unset", async () => {
    expect(await getCreatorShareBps()).toBe(8000);
  });

  it("stores and returns a valid value", async () => {
    expect(await setCreatorShareBps(7250)).toBe(7250);
    expect(await getCreatorShareBps()).toBe(7250);
  });

  it("rejects out-of-range or non-integer values and keeps the previous one", async () => {
    await setCreatorShareBps(7500);
    await expect(setCreatorShareBps(6999)).rejects.toThrow();
    await expect(setCreatorShareBps(8001)).rejects.toThrow();
    await expect(setCreatorShareBps(7500.5)).rejects.toThrow();
    expect(await getCreatorShareBps()).toBe(7500);
  });

  it("falls back to the default when the stored value is invalid", async () => {
    setMemoryCreatorShareRaw(12345);
    expect(await getCreatorShareBps()).toBe(8000);
    setMemoryCreatorShareRaw("abc");
    expect(await getCreatorShareBps()).toBe(8000);
  });
});
