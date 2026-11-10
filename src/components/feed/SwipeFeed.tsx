"use client";

import { useState } from "react";
import LayoutToggle from "./LayoutToggle";
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
  const [layout, setLayout] = useState<FeedLayout>(initialLayout);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div className={`feed-shell layout-${layout}`} data-testid="feed-shell" data-layout={layout}>
      <header className="feed-header">
        <div>
          <p className="feed-eyebrow">Category</p>
          <h1 className="feed-title" data-testid="category-title">{category}</h1>
        </div>
        <div className="feed-controls">
          <LayoutToggle value={layout} onChange={setLayout} persist={canPersist} />
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