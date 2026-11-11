"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import VideoSlide from "./VideoSlide";
import SidePanel from "./SidePanel";
import type { FeedItem, FeedLayout } from "./feed-data";
import "./feed.css";

export default function SwipeFeed({
  category,
  items,
  initialLayout,
  canPersist = false,
}: {
  category: string;
  items: FeedItem[];
  initialLayout: FeedLayout;
  canPersist?: boolean;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const layout: FeedLayout = initialLayout;

  function hrefFor(next: FeedLayout) {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("layout", next);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function persist(next: FeedLayout) {
    if (!canPersist) return;
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedLayout: next }),
    }).catch(() => {
      // non-blocking
    });
  }

  return (
    <div className={`feed-shell layout-${layout}`} data-testid="feed-shell" data-layout={layout}>
      <header className="feed-header">
        <div>
          <p className="feed-eyebrow">Category</p>
          <h1 className="feed-title" data-testid="category-title">{category}</h1>
        </div>
        <div className="feed-controls">
          <div role="group" aria-label="Feed layout">
            <Link
              href={hrefFor("immersive")}
              scroll={false}
              role="button"
              aria-pressed={layout === "immersive"}
              className={layout === "immersive" ? "active" : undefined}
              onClick={() => persist("immersive")}
            >
              Immersive
            </Link>
            <Link
              href={hrefFor("side")}
              scroll={false}
              role="button"
              aria-pressed={layout === "side"}
              className={layout === "side" ? "active" : undefined}
              onClick={() => persist("side")}
            >
              Side
            </Link>
          </div>
          {layout === "immersive" ? (
            <button
              type="button"
              className="panel-toggle"
              onClick={() => setPanelOpen((v) => !v)}
              aria-expanded={panelOpen}
              aria-controls="feed-side-panel"
            >
              {panelOpen ? "Hide panel" : "Comments & Featured"}
            </button>
          ) : null}
        </div>
      </header>

      <div className={`feed-body ${layout === "side" ? "with-side" : ""}`}>
        <main className="feed-main">
          <div className="swipe-feed" data-testid="swipe-feed" aria-label="Video feed">
            {items.map((item, i) => (
              <VideoSlide key={item.id} item={item} index={i} />
            ))}
          </div>
        </main>
        <div id="feed-side-panel">
          <SidePanel
            mode={layout}
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}