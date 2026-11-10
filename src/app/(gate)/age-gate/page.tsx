import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AGE_GATE_COOKIE,
  AGE_GATE_COOKIE_MAX_AGE,
  AGE_GATE_COOKIE_VALUE,
  recordAgeConfirmation,
} from "@/lib/age-gate";

function safeNextPath(next: string | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  return next;
}

async function confirmAge(formData: FormData) {
  "use server";
  const next = safeNextPath(formData.get("next")?.toString());
  const cookieStore = await cookies();
  cookieStore.set(AGE_GATE_COOKIE, AGE_GATE_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AGE_GATE_COOKIE_MAX_AGE,
  });

  // Auth/session not fully built yet (Task 4). When a session exists later, pass the
  // authenticated user id here to persist ageConfirmedAt; guests rely on the cookie.
  await recordAgeConfirmation(undefined);

  redirect(next);
}

async function AgeGateContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", padding: "1.5rem" }}>
      <h1>18+ Age Confirmation Required</h1>
      <p>
        This site contains adult material intended only for adults. You must confirm that you
        are at least 18 years old (or the age of majority in your location) to continue.
      </p>
      <form action={confirmAge}>
        <input type="hidden" name="next" value={next} />
        <label style={{ display: "block", margin: "1rem 0" }}>
          <input type="checkbox" name="confirm" required /> I am 18 years of age or older and I
          want to enter.
        </label>
        <button type="submit">Enter site</button>
      </form>
    </main>
  );
}

export default function AgeGatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <Suspense fallback={<main style={{ padding: "1.5rem" }}>Loading…</main>}>
      <AgeGateContent searchParams={searchParams} />
    </Suspense>
  );
}
