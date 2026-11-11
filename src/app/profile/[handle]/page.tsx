import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { assetUrl, listProfileMedia } from "@/lib/media/feed";

export const instant = false;

type Props = { params: Promise<{ handle: string }> };

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
          <ul
            data-testid="profile-media"
            style={{
              listStyle: "none",
              padding: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            {media.map((m) => (
              <li key={m.id}>
                <a href={assetUrl(m.id, "web")} style={{ display: "block" }}>
                  {m.assets.some((a) => a.kind === "thumbnail") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={assetUrl(m.id, "thumbnail")}
                      alt={m.title || "Untitled"}
                      style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 8, background: "#141420" }}
                    />
                  ) : (
                    <div style={{ aspectRatio: "9 / 16", borderRadius: 8, background: "#141420", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {m.type === "video" ? "Video" : "Image"}
                    </div>
                  )}
                  <span>{m.title || "Untitled"}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner ? (
        <p style={{ marginTop: 24 }}>
          <Link href="/settings">Edit settings</Link>
        </p>
      ) : null}
    </main>
  );
}
