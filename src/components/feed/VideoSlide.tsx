import type { FeedItem } from "./feed-data";

export default function VideoSlide({ item, index }: { item: FeedItem; index: number }) {
  return (
    <section
      className="video-slide"
      data-testid="video-slide"
      data-index={index}
      aria-label={item.title}
    >
      <div className="video-poster" aria-hidden="true">
        <div className="poster-badge">{item.poster}</div>
      </div>
      <div className="video-meta">
        <h2 className="video-title">{item.title}</h2>
        <p className="video-creator">{item.creator}</p>
      </div>
      <div className="actions-overlay" aria-label="Video actions">
        <button type="button" aria-label="Rate">Rate</button>
        <button type="button" aria-label="Comment">Comment</button>
        <button type="button" aria-label="Share">Share</button>
      </div>
    </section>
  );
}
