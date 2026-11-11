import { beforeEach, describe, expect, it } from "vitest";
import {
  getCreatorPricing,
  priceForAccessType,
  resetMemoryPricing,
  setCreatorPricing,
  validateCreatorPricing,
} from "@/lib/payments/pricing";
import { MAX_UNLOCK_PRICE_CENTS } from "@/lib/media/config";

const NONE = { monthlyPriceCents: null, yearlyPriceCents: null, oneTimePriceCents: null };

beforeEach(() => {
  delete process.env.DATABASE_URL;
  resetMemoryPricing();
});

describe("validateCreatorPricing", () => {
  it("accepts nulls and integers in 1..MAX", () => {
    const value = { monthlyPriceCents: 1, yearlyPriceCents: MAX_UNLOCK_PRICE_CENTS, oneTimePriceCents: null };
    expect(validateCreatorPricing(value)).toEqual({ ok: true, value });
  });

  it("treats missing keys as not offered and drops unknown keys", () => {
    expect(validateCreatorPricing({ monthlyPriceCents: 500, other: 1 })).toEqual({
      ok: true,
      value: { ...NONE, monthlyPriceCents: 500 },
    });
    expect(validateCreatorPricing({})).toEqual({ ok: true, value: NONE });
  });

  it("rejects non-objects", () => {
    for (const bad of [null, undefined, "x", 5, []]) {
      expect(validateCreatorPricing(bad).ok).toBe(false);
    }
  });

  it("rejects zero, negatives, fractions, too-large and non-numbers", () => {
    for (const v of [0, -1, 1.5, MAX_UNLOCK_PRICE_CENTS + 1, "500", Number.NaN, true]) {
      for (const key of ["monthlyPriceCents", "yearlyPriceCents", "oneTimePriceCents"]) {
        const res = validateCreatorPricing({ [key]: v });
        expect(res.ok, `${key}=${String(v)}`).toBe(false);
      }
    }
  });
});

describe("pricing store", () => {
  it("returns all nulls when nothing is stored", async () => {
    expect(await getCreatorPricing("c1")).toEqual(NONE);
  });

  it("stores and replaces per user", async () => {
    const p = { monthlyPriceCents: 999, yearlyPriceCents: 9999, oneTimePriceCents: null };
    expect(await setCreatorPricing("c1", p)).toEqual(p);
    expect(await getCreatorPricing("c1")).toEqual(p);
    expect(await getCreatorPricing("c2")).toEqual(NONE);

    await setCreatorPricing("c1", { ...NONE, oneTimePriceCents: 2500 });
    expect(await getCreatorPricing("c1")).toEqual({ ...NONE, oneTimePriceCents: 2500 });
  });

  it("returns copies, not the stored object", async () => {
    await setCreatorPricing("c1", { ...NONE, monthlyPriceCents: 100 });
    const got = await getCreatorPricing("c1");
    got.monthlyPriceCents = 1;
    expect((await getCreatorPricing("c1")).monthlyPriceCents).toBe(100);
  });

  it("refuses invalid values", async () => {
    await expect(setCreatorPricing("c1", { ...NONE, monthlyPriceCents: 0 })).rejects.toThrow(RangeError);
    expect(await getCreatorPricing("c1")).toEqual(NONE);
  });
});

describe("priceForAccessType", () => {
  const p = { monthlyPriceCents: 1, yearlyPriceCents: 2, oneTimePriceCents: 3 };
  it("maps collection access types to their price", () => {
    expect(priceForAccessType(p, "monthly")).toBe(1);
    expect(priceForAccessType(p, "yearly")).toBe(2);
    expect(priceForAccessType(p, "one_time")).toBe(3);
    expect(priceForAccessType(NONE, "monthly")).toBeNull();
  });
});
