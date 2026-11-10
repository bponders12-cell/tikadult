import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserSettings, updateUserSettings } from "@/lib/settings";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const settings = await getUserSettings(session.user.id);
    return NextResponse.json({ settings });
  } catch {
    // Graceful fallback shape
    return NextResponse.json({ settings: null }, { status: 200 });
  }
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  // Only accept known user-owned setting fields.
  const safePatch: Record<string, unknown> = {};
  if ("feedLayout" in patch) safePatch.feedLayout = patch.feedLayout;
  if ("privacyPrefs" in patch) safePatch.privacyPrefs = patch.privacyPrefs;
  if ("messagingPrefs" in patch) safePatch.messagingPrefs = patch.messagingPrefs;

  try {
    const settings = await updateUserSettings(
      session.user.id,
      session.user.id,
      safePatch as any,
    );
    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to update settings" }, { status: 500 });
  }
}
