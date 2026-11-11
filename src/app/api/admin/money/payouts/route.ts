import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/media/api";
import { markCreatorPayoutsPaid } from "@/lib/payments/records";

/**
 * Records that a creator's unpaid earnings (completed transactions) were paid out off-platform.
 * Bookkeeping only: no money moves. Admin only. Body `{ creatorId, asOf? }` -> `{ markedCount, paidCents }`.
 * `asOf` (ISO timestamp, e.g. when the admin's page was rendered) limits marking to transactions completed
 * at or before it, so a purchase completing after the admin confirmed the amount is never marked.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) return jsonError("Unauthorized", 401);
  if (session.user.role !== "admin") return jsonError("Forbidden", 403);
  const parsed = await readJson(request);
  if (!parsed.ok) return jsonError("Invalid JSON", 400);
  const body =
    parsed.body && typeof parsed.body === "object" && !Array.isArray(parsed.body)
      ? (parsed.body as { creatorId?: unknown; asOf?: unknown })
      : {};
  const { creatorId } = body;
  if (typeof creatorId !== "string" || creatorId.trim() === "") return jsonError("creatorId is required", 400);
  let completedAsOf: Date | undefined;
  if ("asOf" in body) {
    completedAsOf = typeof body.asOf === "string" ? new Date(body.asOf) : undefined;
    if (!completedAsOf || Number.isNaN(completedAsOf.getTime())) {
      return jsonError("asOf must be an ISO timestamp", 400);
    }
  }
  return NextResponse.json(await markCreatorPayoutsPaid(creatorId, { completedAsOf }));
}
