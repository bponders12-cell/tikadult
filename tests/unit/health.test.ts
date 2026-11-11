import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health", () => {
  it("returns ok", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });
});