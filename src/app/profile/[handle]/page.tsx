import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
  const displayName = user.profile?.displayName || user.handle;

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>{displayName}</h1>
      <p>@{user.handle}</p>
      <p>Role: {user.role}</p>
      {user.profile?.bio ? <p>{user.profile.bio}</p> : <p>No bio yet.</p>}

      <section style={{ marginTop: 24 }}>
        <h2>Public profile</h2>
        <p>This is a basic public profile shell. Media and social features arrive in follow-on plans.</p>
      </section>

      {isOwner ? (
        <p style={{ marginTop: 24 }}>
          <Link href="/settings">Edit settings</Link>
        </p>
      ) : null}
    </main>
  );
}
