import Link from "next/link";
import { prisma } from "@/lib/db";

export const instant = false;
import { getDefaultCategories } from "@/lib/categories";

export default async function Home() {
  let categories = getDefaultCategories();
  if (process.env.DATABASE_URL) {
    try {
      const rows = await prisma.category.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { slug: true, name: true, sortOrder: true },
      });
      if (rows.length > 0) categories = rows;
    } catch {
      // fallback to defaults (DB may be unavailable)
    }
  }

  return (
    <main style={{ padding: 32, maxWidth: 960, margin: "0 auto" }}>
      <h1>Browse categories</h1>
      <p>Pick a category to open the vertical swipe feed.</p>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12, marginTop: 24 }}>
        {categories.map((cat) => (
          <li key={cat.slug}>
            <Link
              href={`/c/${cat.slug}`}
              style={{
                display: "block",
                padding: "16px 18px",
                border: "1px solid #333",
                borderRadius: 12,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <strong>{cat.name}</strong>
              <div style={{ color: "#888", fontSize: 14 }}>/c/{cat.slug}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
