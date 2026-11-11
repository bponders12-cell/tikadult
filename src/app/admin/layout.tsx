import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/rbac";

export const instant = false;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!canAccessAdmin(session?.user)) {
    redirect("/login");
  }
  return (
    <div style={{ padding: "1.5rem" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
        <p style={{ margin: "0.25rem 0", color: "#555" }}>
          Ops shell (restricted to admin/staff). Dashboards are placeholders for follow-on plans.
        </p>
      </header>
      {children}
    </div>
  );
}
