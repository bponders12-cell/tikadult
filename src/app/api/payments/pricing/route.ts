import { NextResponse } from "next/server";
import { jsonError, readJson, requireUserId } from "@/lib/media/api";
import { getCreatorPricing, setCreatorPricing, validateCreatorPricing } from "@/lib/payments/pricing";

/** The signed-in creator's own private-collection prices. */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  return NextResponse.json({ pricing: await getCreatorPricing(userId) });
}

/** Replaces all three prices; a missing or null price means the option is not offered. */
export async function PUT(request: Request) {
  const userId = await requireUserId();
  if (!userId) return jsonError("Unauthorized", 401);
  const parsed = await readJson(request);
  if (!parsed.ok) return jsonError("Invalid JSON", 400);
  const v = validateCreatorPricing(parsed.body);
  if (!v.ok) return jsonError(v.error, 400);
  return NextResponse.json({ pricing: await setCreatorPricing(userId, v.value) });
}
