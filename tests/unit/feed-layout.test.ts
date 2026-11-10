import { describe, it, expect } from "vitest";
import { resolveFeedLayout } from "@/lib/settings";
describe("resolveFeedLayout", () => {
  it("uses immersive by default", () => expect(resolveFeedLayout(undefined)).toBe("immersive"));
  it("respects side", () => expect(resolveFeedLayout("side")).toBe("side"));
});