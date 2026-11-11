import { NextResponse } from "next/server";
import { findUserByEmail, getSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import type { UserRole } from "@/lib/rbac";

// Minimal credential/session auth endpoint (Auth.js-style path reserved for compatibility).
// POST { email, password } -> sets session cookie; GET -> returns current session.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({ user: session.user }, { status: 200 });
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const email = (body.email || "").toLowerCase().trim();
  const password = body.password || "";
  if (!email || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
  }
  try {
    const user = await findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }
    await setSessionCookie({
      id: user.id,
      role: user.role as UserRole,
      email: user.email,
      handle: user.handle,
    });
    return NextResponse.json(
      { user: { id: user.id, role: user.role, email: user.email, handle: user.handle } },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
