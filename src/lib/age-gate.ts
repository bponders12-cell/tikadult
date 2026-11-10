import type { NextRequest } from "next/server";

export const AGE_GATE_COOKIE = "age_confirmed";
export const AGE_GATE_COOKIE_VALUE = "1";
export const AGE_GATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type AgeGateState = {
  ageConfirmed: boolean;
  userId?: string | null;
};

/**
 * Returns true when a request to `pathname` must be blocked until age is confirmed.
 * Used by middleware/route guards. The gate applies to content routes (feeds/categories,
 * profile media) and is bypassed only when the caller is explicitly confirmed.
 */
export function requiresAgeGate(state: AgeGateState, pathname: string): boolean {
  if (state.ageConfirmed) return false;
  return isProtectedContentPath(pathname);
}

export function isProtectedContentPath(pathname: string): boolean {
  // Protected content routes (deep links must not bypass): category/feed and profile media.
  if (pathname === "/c" || pathname.startsWith("/c/")) return true;
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return true;
  if (pathname === "/feed" || pathname.startsWith("/feed/")) return true;
  return false;
}

export function isAgeGateExemptPath(pathname: string): boolean {
  if (pathname === "/age-gate" || pathname.startsWith("/age-gate/")) return true;
  if (pathname.startsWith("/api/age-gate")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname.startsWith("/api/health")) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/assets") || pathname.startsWith("/static")) return true;
  // Allow common static file extensions.
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return true;
  return false;
}

export function isAgeConfirmedFromRequest(request: NextRequest): boolean {
  const cookie = request.cookies.get(AGE_GATE_COOKIE)?.value;
  return cookie === AGE_GATE_COOKIE_VALUE;
}

export function isAgeConfirmedFromCookieHeader(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const parts = cookieHeader.split(/;\s*/);
  for (const part of parts) {
    const [k, ...rest] = part.split("=");
    if (k === AGE_GATE_COOKIE) {
      return rest.join("=") === AGE_GATE_COOKIE_VALUE;
    }
  }
  return false;
}

/**
 * Persist age confirmation for an authenticated user when auth/session exists.
 * Task 4 will wire session lookup; this helper is safe to call now (no-op if userId missing
 * or DB unavailable). Guest confirmation is represented by the signed/HttpOnly cookie set by
 * the confirm route/action.
 */
export async function recordAgeConfirmation(userId?: string | null): Promise<void> {
  if (!userId) return;
  try {
    const { prisma } = await import("@/lib/db");
    await prisma.user.update({
      where: { id: userId },
      data: { ageConfirmedAt: new Date() },
    });
  } catch {
    // DB may be unavailable in early/local environments or user may not exist yet; cookie still gates guests.
  }
}
