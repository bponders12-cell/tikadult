import Link from "next/link";

const tiles: { title: string; note: string; href?: string }[] = [
  { title: "Logs", note: "Coming in follow-on plans." },
  { title: "Usage", note: "Coming in follow-on plans." },
  { title: "User counts", note: "Coming in follow-on plans." },
  { title: "Registrations", note: "Coming in follow-on plans." },
  { title: "Complaints/Flags", note: "Coming in follow-on plans." },
  {
    title: "Money flow",
    note: "Purchases, platform cut, creator earnings, refunds/chargebacks, split and payouts.",
    href: "/admin/money",
  },
  {
    title: "Health & ops",
    note: "GET /api/health available. See docs/ops/cost-and-deploy-notes.md for budget/cost/launch validation notes.",
  },
];

export default function AdminPage() {
  return (
    <main>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        {tiles.map((tile) => (
          <article
            key={tile.title}
            style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}
          >
            <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>
              {tile.href ? <Link href={tile.href}>{tile.title}</Link> : tile.title}
            </h2>
            <p style={{ marginBottom: 0, color: "#666" }}>{tile.note}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
