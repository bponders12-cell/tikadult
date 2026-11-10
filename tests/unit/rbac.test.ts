import { describe, it, expect } from "vitest";
import { canAccessAdmin } from "@/lib/rbac";

describe("rbac", () => {
  it("denies viewer", () => expect(canAccessAdmin({ role: "viewer" } as any)).toBe(false));
  it("allows admin", () => expect(canAccessAdmin({ role: "admin" } as any)).toBe(true));
});