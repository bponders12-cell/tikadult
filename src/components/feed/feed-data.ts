import type { FeedLayout } from "@/lib/settings";

export type FeedMedia = {
  type: "video" | "image";
  /** Delivery URL (see /api/media/[id]/asset/[kind]). */
  src: string;
  posterSrc: string | null;
};

export type FeedItem = {
  id: string;
  title: string;
  creator: string;
  poster: string;
  /** Absent for placeholder slides. */
  media?: FeedMedia;
};

export function getPlaceholderSlides(category: string): FeedItem[] {
  const label = category.charAt(0).toUpperCase() + category.slice(1);
  return [
    { id: `${category}-1`, title: `${label} spotlight`, creator: "@creator_one", poster: "Placeholder poster" },
    { id: `${category}-2`, title: `${label} highlight`, creator: "@creator_two", poster: "Placeholder poster" },
    { id: `${category}-3`, title: `${label} discovery`, creator: "@creator_three", poster: "Placeholder poster" },
  ];
}

export type { FeedLayout };