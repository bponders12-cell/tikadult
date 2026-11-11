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

describe("payment webhooks are not age-gated", () => {
  // The provider calls the webhook server-to-server without the age cookie; a redirect would
  // drop every delivery. Middleware redirects only when requiresAgeGate() is true.
  it.each(["/api/webhooks/payments/fake", "/api/payments/fake/simulate"])("%s passes the gate", (path) => {
    expect(requiresAgeGate({ ageConfirmed: false }, path)).toBe(false);
  });
});
