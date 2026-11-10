import Link from "next/link";
import SwipeFeed from "@/components/feed/SwipeFeed";

export const instant = false;
import { getPlaceholderSlides } from "@/components/feed/feed-data";
import { prisma } from "@/lib/db";
import { getDefaultCategories } from "@/lib/categories";
import { getSession } from "@/lib/auth";
import { getUserSettings, resolveFeedLayout } from "@/lib/settings";

type Params = { params: Promise<{ category: string }> };

async function getCategory(slug: string) {
  if (process.env.DATABASE_URL) {
    try {
      const cat = await prisma.category.findUnique({ where: { slug } });
      if (cat && cat.active) return { slug: cat.slug, name: cat.name };
    } catch {
      // fall through
    }
  }
  const fallback = getDefaultCategories().find((c) => c.slug === slug);
  return fallback ? { slug: fallback.slug, name: fallback.name } : null;
}

export default async function CategoryFeedPage({ params }: Params) {
  const { category } = await params;
  const slug = decodeURIComponent(category).toLowerCase();
  const cat = await getCategory(slug);
  const session = await getSession();
  const canPersist = Boolean(session?.user?.id);
  const initialLayout = session?.user?.id
    ? resolveFeedLayout((await getUserSettings(session.user.id)).feedLayout)
    : resolveFeedLayout(undefined);
  const items = getPlaceholderSlides(slug);

  if (!cat) {
    return (
      <main style={{ padding: 24, color: "#fff", background: "#0b0b10", minHeight: "100vh" }}>
        <h1>Category not found</h1>
        <p>The category "{slug}" is not available.</p>
        <Link href="/">Back to categories</Link>
      </main>
    );
  }

  return (
    <SwipeFeed
      category={cat.name}
      items={items}
      initialLayout={initialLayout}
      canPersist={canPersist}
    />
  );
}
