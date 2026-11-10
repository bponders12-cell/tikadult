export type Category = { slug: string; name: string; sortOrder: number };

export const DEFAULT_CATEGORIES: Category[] = [
  { slug: "featured", name: "Featured", sortOrder: 0 },
  { slug: "new", name: "New", sortOrder: 1 },
  { slug: "popular", name: "Popular", sortOrder: 2 },
  { slug: "trending", name: "Trending", sortOrder: 3 },
  { slug: "creators", name: "Creators", sortOrder: 4 },
];

export function getDefaultCategories(): Category[] {
  return [...DEFAULT_CATEGORIES].sort((a, b) => a.sortOrder - b.sortOrder);
}