import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assetUrl, listProfileMedia } from "@/lib/media/feed";
import { centsToDollars } from "@/lib/media/format";
import { loadPrivateCollectionView, type PrivateCollectionView } from "@/lib/payments/profile-access";

export const instant = false;

type Props = { params: Promise<{ handle: string }> };

const GRID_STYLE = {
  listStyle: "none",
  padding: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: 12,
} as const;
const POSTER_STYLE = { aspectRatio: "9 / 16", borderRadius: 8, background: "#141420" } as const;
const PLACEHOLDER_STYLE = { ...POSTER_STYLE, display: "flex", alignItems: "center", justifyContent: "center" } as const;

const OFFER_LABEL = { monthly: "30 days", yearly: "365 days", one_time: "Forever (one-time)" } as const;

function PlayableTile(props: { title: string; type: string; webSrc: string; thumbnailSrc: string | null }) {
  return (
    <a href={props.webSrc} style={{ display: "block" }}>
      {props.thumbnailSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.thumbnailSrc} alt={props.title} style={{ ...POSTER_STYLE, width: "100%", objectFit: "cover" }} />
      ) : (
        <div style={PLACEHOLDER_STYLE}>{props.type === "video" ? "Video" : "Image"}</div>
      )}
      <span>{props.title}</span>
    </a>
  );
}

function PrivateCollection({ view }: { view: PrivateCollectionView }) {
  return (
    <section style={{ marginTop: 24 }} data-testid="private-collection">
      <h2>Private collection</h2>
      {view.accessUntil ? <p>Access until {view.accessUntil.toISOString().slice(0, 10)}</p> : null}
      {view.offers.length > 0 ? (
        <ul data-testid="collection-offers">
          {view.offers.map((o) => (
            <li key={o.type}>
              <Link href={o.href}>
                {OFFER_LABEL[o.type]}: ${centsToDollars(o.priceCents)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {view.tiles.length === 0 ? (
        <p>No private posts yet.</p>
      ) : (
        <ul data-testid="private-media" style={GRID_STYLE}>
          {view.tiles.map((t) => (
            <li key={t.id}>
              {t.kind === "unlocked" ? (
                <PlayableTile title={t.title} type={t.type} webSrc={t.webSrc} thumbnailSrc={t.thumbnailSrc} />
              ) : (
                <div data-locked="true">
                  <div style={PLACEHOLDER_STYLE}>Locked</div>
                  <span>{t.title}</span>
                  {t.checkoutHref && t.priceCents !== null ? (
                    <div>
                      <Link href={t.checkoutHref}>Unlock for ${centsToDollars(t.priceCents)}</Link>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params;
  let user: {
    id: string;
    handle: string;
    role: string;
    createdAt?: Date;
    profile?: { displayName: string | null; bio: string | null; avatarUrl: string | null } | null;
  } | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { handle },
      select: {
        id: true,
        handle: true,
        role: true,
        createdAt: true,
        profile: { select: { displayName: true, bio: true, avatarUrl: true } },
      },
    });
  } catch {
    // DB unavailable: degrade gracefully to a basic shell for the requested handle
    user = { id: "unknown", handle, role: "viewer", profile: null };
  }

  if (!user) notFound();

  const session = await getSession();
  const isOwner = session?.user?.id === user.id || session?.user?.handle === user.handle;
  const media = user.id === "unknown" ? [] : await listProfileMedia(user.id);
  const privateView =
    user.id === "unknown"
      ? null
      : await loadPrivateCollectionView(user.id, { id: session?.user?.id ?? null, isOwner });
  const displayName = user.profile?.displayName || user.handle;

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>{displayName}</h1>
      <p>@{user.handle}</p>
      <p>Role: {user.role}</p>
      {user.profile?.bio ? <p>{user.profile.bio}</p> : <p>No bio yet.</p>}

      <section style={{ marginTop: 24 }}>
        <h2>Media</h2>
        {media.length === 0 ? (
          <p>No public media yet.</p>
        ) : (
          <ul data-testid="profile-media" style={GRID_STYLE}>
            {media.map((m) => (
              <li key={m.id}>
                <PlayableTile
                  title={m.title || "Untitled"}
                  type={m.type}
                  webSrc={assetUrl(m.id, "web")}
                  thumbnailSrc={m.assets.some((a) => a.kind === "thumbnail") ? assetUrl(m.id, "thumbnail") : null}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {privateView ? <PrivateCollection view={privateView} /> : null}

      {isOwner ? (
        <p style={{ marginTop: 24 }}>
          <Link href="/settings">Edit settings</Link>
        </p>
      ) : null}
    </main>
  );
}
