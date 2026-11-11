import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/media/api";
import { MAX_CREATOR_SHARE_BPS, MIN_CREATOR_SHARE_BPS, isValidCreatorShareBps } from "@/lib/payments/split";
import { getCreatorShareBps, setCreatorShareBps } from "@/lib/platform-settings";
import { canAccessAdmin } from "@/lib/rbac";

const splitBody = (creatorShareBps: number) => ({
  creatorShareBps,
  min: MIN_CREATOR_SHARE_BPS,
  max: MAX_CREATOR_SHARE_BPS,
});

/** Current creator share (basis points) with its allowed bounds. Admin or staff. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return jsonError("Unauthorized", 401);
  if (!canAccessAdmin(session.user)) return jsonError("Forbidden", 403);
  return NextResponse.json(splitBody(await getCreatorShareBps()));
}

/** Changes the split for purchases made from now on; past transactions keep theirs. Admin only. */
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) return jsonError("Unauthorized", 401);
  if (session.user.role !== "admin") return jsonError("Forbidden", 403);
  const parsed = await readJson(request);
  if (!parsed.ok) return jsonError("Invalid JSON", 400);
  const bps =
    parsed.body && typeof parsed.body === "object" && !Array.isArray(parsed.body)
      ? (parsed.body as { creatorShareBps?: unknown }).creatorShareBps
      : undefined;
  if (!isValidCreatorShareBps(bps)) {
    return jsonError(
      `creatorShareBps must be an integer between ${MIN_CREATOR_SHARE_BPS} and ${MAX_CREATOR_SHARE_BPS}`,
      400,
    );
  }
  return NextResponse.json(splitBody(await setCreatorShareBps(bps)));
}
