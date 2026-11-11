import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/media/api";
import { markCreatorPayoutsPaid } from "@/lib/payments/records";

/**
 * Records that a creator's unpaid earnings (completed transactions) were paid out off-platform.
 * Bookkeeping only: no money moves. Admin only. Body `{ creatorId }` -> `{ markedCount, paidCents }`.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) return jsonError("Unauthorized", 401);
  if (session.user.role !== "admin") return jsonError("Forbidden", 403);
  const parsed = await readJson(request);
  if (!parsed.ok) return jsonError("Invalid JSON", 400);
  const creatorId =
    parsed.body && typeof parsed.body === "object" && !Array.isArray(parsed.body)
      ? (parsed.body as { creatorId?: unknown }).creatorId
      : undefined;
  if (typeof creatorId !== "string" || creatorId.trim() === "") return jsonError("creatorId is required", 400);
  return NextResponse.json(await markCreatorPayoutsPaid(creatorId));
}
