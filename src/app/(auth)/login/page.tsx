import { redirect } from "next/navigation";
import { findUserByEmail, getSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { recordAgeConfirmation } from "@/lib/age-gate";

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) {
    redirect("/login?error=missing");
  }
  try {
    const user = await findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      redirect("/login?error=invalid");
    }
    await setSessionCookie({
      id: user.id,
      role: user.role as any,
      email: user.email,
      handle: user.handle,
    });
    await recordAgeConfirmation(user.id);
    redirect("/");
  } catch {
    redirect("/login?error=unavailable");
  }
}

export default async function LoginPage({
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
      <h1>Log in</h1>
      {error ? (
        <p role="alert" style={{ color: "crimson" }}>
          {error === "invalid"
            ? "Invalid email or password."
            : error === "missing"
              ? "Email and password are required."
              : "Login unavailable. Database may not be configured."}
        </p>
      ) : null}
      <form action={loginAction}>
        <label style={{ display: "block", margin: "0.75rem 0" }}>
          Email
          <input name="email" type="email" required style={{ display: "block", width: "100%" }} />
        </label>
        <label style={{ display: "block", margin: "0.75rem 0" }}>
          Password
          <input
            name="password"
            type="password"
            required
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <button type="submit">Log in</button>
      </form>
      <p style={{ marginTop: "1rem" }}>
        Need an account? <a href="/register">Register</a>
      </p>
    </main>
  );
}
