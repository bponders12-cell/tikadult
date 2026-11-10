import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";

export type Role = "viewer" | "creator" | "admin" | "staff";

export type Session = {
  user: {
    id: string;
    role: Role;
    email?: string;
    handle?: string;
  };
} | null;

export type SessionUser = NonNullable<Session>["user"];

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dev-insecure-secret-change-me"
  );
}

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function sign(data: string): string {
  return base64url(createHmac("sha256", getSecret()).update(data).digest());
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function createSessionToken(user: SessionUser): string {
  const payload = base64url(
    JSON.stringify({ sub: user.id, role: user.role, email: user.email, handle: user.handle, iat: Date.now() }),
  );
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(base64urlDecode(payload).toString("utf8")) as {
      sub?: string;
      role?: Role;
      email?: string;
      handle?: string;
    };
    if (!data.sub || !data.role) return null;
    return { id: data.sub, role: data.role, email: data.email, handle: data.handle };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const user = verifySessionToken(token);
    if (!user) return null;
    // Best-effort DB refresh to ensure current role/id; fall back to token if DB unavailable.
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, role: true, email: true, handle: true },
      });
      if (dbUser) {
        return {
          user: {
            id: dbUser.id,
            role: dbUser.role as Role,
            email: dbUser.email,
            handle: dbUser.handle,
          },
        };
      }
    } catch {
      // ignore, use token payload
    }
    return { user };
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserByHandle(handle: string) {
  return prisma.user.findUnique({ where: { handle } });
}

export async function createUser(input: {
  email: string;
  handle: string;
  password: string;
  role?: Role;
  ageConfirmed?: boolean;
}) {
  return prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      handle: input.handle,
      passwordHash: hashPassword(input.password),
      role: input.role ?? "viewer",
      ageConfirmedAt: input.ageConfirmed ? new Date() : null,
      settings: {
        create: {
          feedLayout: "immersive",
          privacyPrefs: {},
          messagingPrefs: {},
        },
      },
      profile: {
        create: {},
      },
    },
    select: { id: true, role: true, email: true, handle: true },
  });
}
