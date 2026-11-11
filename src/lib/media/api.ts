import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMedia, type MediaRecord } from "@/lib/media/records";

export const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

/** Returns the signed-in user id, or null (caller responds 401). */
export async function requireUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/** Loads a media record only if owned by `userId`; others get null (reported as 404). */
export async function getOwnedMedia(id: string, userId: string): Promise<MediaRecord | null> {
  const media = await getMedia(id);
  return media && media.ownerId === userId ? media : null;
}

/** Client-facing shape: drops storage keys. */
export function toPublicMedia(m: MediaRecord) {
  return {
    ...m,
    assets: m.assets.map((a) => ({ kind: a.kind, contentType: a.contentType, sizeBytes: a.sizeBytes })),
  };
}

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

export type IdContext = { params: Promise<{ id: string }> };
