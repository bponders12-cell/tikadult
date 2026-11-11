import { NextResponse } from "next/server";
import { jsonError, readJson, requireUserId } from "@/lib/media/api";
import { createCheckout, isAccessType } from "@/lib/payments/checkout";

const optionalId = (v: unknown): v is string | undefined => v === undefined || typeof v === "string";

/** Starts a checkout for the signed-in buyer. Body: { accessType, creatorId?, mediaId? }. */
export async function POST(request: Request) {
  const buyerId = await requireUserId();
  if (!buyerId) return jsonError("Unauthorized", 401);
  const parsed = await readJson(request);
  if (!parsed.ok) return jsonError("Invalid JSON", 400);

  const body = parsed.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request", 400);
  const { accessType, creatorId, mediaId } = body as Record<string, unknown>;
  if (!isAccessType(accessType)) return jsonError("Invalid accessType", 400);
  if (!optionalId(creatorId) || !optionalId(mediaId)) return jsonError("Invalid request", 400);

  const origin = process.env.NEXTAUTH_URL || new URL(request.url).origin;
  const result = await createCheckout({ buyerId, accessType, creatorId, mediaId, origin });
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json(
    { transactionId: result.transactionId, redirectUrl: result.redirectUrl },
    { status: 201 },
  );
}
