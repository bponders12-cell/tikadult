import { NextResponse, type NextRequest } from "next/server";
import {
  isAgeConfirmedFromRequest,
  isAgeGateExemptPath,
  requiresAgeGate,
} from "@/lib/age-gate";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isAgeGateExemptPath(pathname)) {
    return NextResponse.next();
  }

  const ageConfirmed = isAgeConfirmedFromRequest(request);
  if (!requiresAgeGate({ ageConfirmed }, pathname)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/age-gate";
  const next = `${pathname}${search || ""}`;
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Run on app routes; static assets/files are also filtered in-code for safety.
  // /api/media is excluded: middleware buffers request bodies (10MB default), which
  // would truncate large uploads. Those routes enforce their own auth.
  matcher: ["/((?!_next/static|_next/image|api/media).*)"],
};
