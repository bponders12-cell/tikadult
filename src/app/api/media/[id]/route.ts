import { NextResponse } from "next/server";
import {
  getOwnedMedia,
  jsonError,
  readJson,
  requireUserId,
  toPublicMedia,
  type IdContext,
} from "@/lib/media/api";
import { deleteMedia, updateMedia } from "@/lib/media/records";
import { getStorage } from "@/lib/media/storage";
import { validateUpdate } from "@/lib/media/validation";

export async function GET(_request: Request, { params }: IdContext) {
  const userId = await requireUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const media = await getOwnedMedia((await params).id, userId);
  if (!media) return jsonError("Not found", 404);
  return NextResponse.json({ media: toPublicMedia(media) });
}

/** Edit title / category / visibility / price. Status fields are never client-writable. */
export async function PATCH(request: Request, { params }: IdContext) {
  const userId = await requireUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const media = await getOwnedMedia((await params).id, userId);
  if (!media) return jsonError("Not found", 404);
  const parsed = await readJson(request);
  if (!parsed.ok) return jsonError("Invalid JSON", 400);

  const v = validateUpdate(parsed.body, media);
  if (!v.ok) return jsonError(v.error, v.status);

  const updated = await updateMedia(media.id, v.value);
  if (!updated) return jsonError("Not found", 404);
  return NextResponse.json({ media: toPublicMedia(updated) });
}

export async function DELETE(_request: Request, { params }: IdContext) {
  const userId = await requireUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const media = await getOwnedMedia((await params).id, userId);
  if (!media) return jsonError("Not found", 404);

  const storage = getStorage();
  for (const asset of media.assets) await storage.delete(asset.storageKey);
  await deleteMedia(media.id);
  return NextResponse.json({ ok: true });
}
