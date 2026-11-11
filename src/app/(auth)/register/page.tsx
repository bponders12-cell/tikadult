import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createUser, findUserByEmail, findUserByHandle, getSession, setSessionCookie } from "@/lib/auth";
import { AGE_GATE_COOKIE, AGE_GATE_COOKIE_MAX_AGE, AGE_GATE_COOKIE_VALUE } from "@/lib/age-gate";
import type { UserRole } from "@/lib/rbac";

export const instant = false;

async function registerAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const handle = String(formData.get("handle") || "").trim();
  const password = String(formData.get("password") || "");
  const ageConfirm = formData.get("ageConfirm") === "on";
  if (!email || !handle || !password || !ageConfirm) {
    redirect("/register?error=missing");
  }
  if (password.length < 8) {
    redirect("/register?error=weak");
  }
  try {
    const [existingEmail, existingHandle] = await Promise.all([
      findUserByEmail(email),
      findUserByHandle(handle),
    ]);
    if (existingEmail || existingHandle) {
      redirect("/register?error=exists");
    }
    const user = await createUser({ email, handle, password, ageConfirmed: true });
    const cookieStore = await cookies();
    cookieStore.set(AGE_GATE_COOKIE, AGE_GATE_COOKIE_VALUE, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: AGE_GATE_COOKIE_MAX_AGE,
    });
    await setSessionCookie({
      id: user.id,
      role: user.role as UserRole,
      email: user.email,
      handle: user.handle,
    });
    redirect("/");
  } catch {
    redirect("/register?error=unavailable");
  }
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session?.user) redirect("/");
  const params = await searchParams;
  const error = params.error;

  return (
    <main style={{ maxWidth: 480, margin: "3rem auto", padding: "1.5rem" }}>
      <h1>Create account</h1>
      <p>Registration is for adults (18+) only and records 18+ confirmation for this account.</p>
      {error ? (
        <p role="alert" style={{ color: "crimson" }}>
          {error === "exists"
            ? "An account with that email or handle already exists."
            : error === "weak"
              ? "Password must be at least 8 characters."
              : error === "missing"
                ? "All fields and 18+ confirmation are required."
                : "Registration unavailable. Database may not be configured."}
        </p>
      ) : null}
      <form action={registerAction}>
        <label style={{ display: "block", margin: "0.75rem 0" }}>
          Email
          <input name="email" type="email" required style={{ display: "block", width: "100%" }} />
        </label>
        <label style={{ display: "block", margin: "0.75rem 0" }}>
          Handle
          <input name="handle" type="text" required style={{ display: "block", width: "100%" }} />
        </label>
        <label style={{ display: "block", margin: "0.75rem 0" }}>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <label style={{ display: "block", margin: "0.75rem 0" }}>
          <input type="checkbox" name="ageConfirm" required /> I confirm I am 18+ and agree to enter
          this adult site.
        </label>
        <button type="submit">Register</button>
      </form>
      <p style={{ marginTop: "1rem" }}>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}
