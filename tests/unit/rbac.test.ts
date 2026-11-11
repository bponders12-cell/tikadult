import { describe, it, expect } from "vitest";
import { canAccessAdmin } from "@/lib/rbac";

describe("rbac", () => {
  it("denies viewer", () => expect(canAccessAdmin({ role: "viewer" })).toBe(false));
  it("allows admin", () => expect(canAccessAdmin({ role: "admin" })).toBe(true));
});