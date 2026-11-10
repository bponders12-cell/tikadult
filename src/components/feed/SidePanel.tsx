type Props = {
  mode: "immersive" | "side";
  open?: boolean;
  onClose?: () => void;
};

export default function SidePanel({ mode, open = false, onClose }: Props) {
  const visible = mode === "side" || open;
  return (
    <aside
      className={`side-panel ${mode} ${visible ? "open" : "closed"}`}
      aria-hidden={!visible}
      data-testid="side-panel"
    >
      <div className="side-panel-inner">
        <div className="side-panel-header">
          <h2>Panel</h2>
          {mode === "immersive" ? (
            <button type="button" onClick={onClose} aria-label="Close panel">
              Close
            </button>
          ) : null}
        </div>
        <section aria-label="Comments" className="panel-section">
          <h3>Comments</h3>
          <p className="stub">Comments stub - discussion coming in a follow-on plan.</p>
          <ul className="stub-list">
            <li><strong>@viewer</strong> Placeholder comment</li>
            <li><strong>@fan</strong> Another placeholder</li>
          </ul>
        </section>
        <section aria-label="Featured" className="panel-section">
          <h3>Featured</h3>
          <p className="stub">Featured videos/creators stub.</p>
          <ul className="stub-list">
            <li>Featured creator spotlight</li>
            <li>Trending clip placeholder</li>
          </ul>
        </section>
      </div>
    </aside>
  );
}
