import { describe, it, expect } from "vitest";
import { requiresAgeGate } from "@/lib/age-gate";

describe("requiresAgeGate", () => {
  it("requires gate when not confirmed", () => {
    expect(requiresAgeGate({ ageConfirmed: false }, "/c/new")).toBe(true);
  });

  it("allows when confirmed", () => {
    expect(requiresAgeGate({ ageConfirmed: true }, "/c/new")).toBe(false);
  });
});
