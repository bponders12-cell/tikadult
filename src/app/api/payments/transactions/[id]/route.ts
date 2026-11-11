import { NextResponse } from "next/server";
import { jsonError, requireUserId, type IdContext } from "@/lib/media/api";
import { getTransaction } from "@/lib/payments/records";

/** The buyer's view of one of their transactions; anyone else gets 404. */
export async function GET(_request: Request, { params }: IdContext) {
  const userId = await requireUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const tx = await getTransaction((await params).id);
  if (!tx || tx.buyerId !== userId) return jsonError("Not found", 404);
  return NextResponse.json({
    transaction: {
      id: tx.id,
      status: tx.status,
      accessType: tx.accessType,
      grossCents: tx.grossCents,
      currency: tx.currency,
      creatorId: tx.creatorId,
      mediaId: tx.mediaId,
    },
  });
}
