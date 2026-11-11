import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => getSession() }));

const NOT_FOUND = "NEXT_NOT_FOUND_TEST";
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT_TEST ${url}`);
  },
}));

const reportSpy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/payments/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/report")>();
  return {
    ...actual,
    getMoneyFlowReport: (...args: Parameters<typeof actual.getMoneyFlowReport>) => {
      reportSpy.calls += 1;
      return actual.getMoneyFlowReport(...args);
    },
  };
});

import AdminMoneyPage from "@/app/admin/money/page";
import { resetMemoryPayments } from "@/lib/payments/records";
import { resetMemoryPlatformSettings } from "@/lib/platform-settings";

const as = (role: string | null) =>
  getSession.mockResolvedValue(role ? { user: { id: `u_${role}`, role } } : null);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", undefined);
  resetMemoryPayments();
  resetMemoryPlatformSettings();
  reportSpy.calls = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/admin/money page authorization (independent of the admin layout)", () => {
  it("renders nothing and reads no money data without a session", async () => {
    as(null);
    await expect(AdminMoneyPage()).rejects.toThrow(NOT_FOUND);
    expect(reportSpy.calls).toBe(0);
  });

  it("renders nothing and reads no money data for viewers and creators", async () => {
    for (const role of ["viewer", "creator"]) {
      as(role);
      await expect(AdminMoneyPage()).rejects.toThrow(NOT_FOUND);
    }
    expect(reportSpy.calls).toBe(0);
  });

  it("renders for admin and staff", async () => {
    for (const role of ["admin", "staff"]) {
      as(role);
      await expect(AdminMoneyPage()).resolves.toBeTruthy();
    }
    expect(reportSpy.calls).toBe(2);
  });
});
