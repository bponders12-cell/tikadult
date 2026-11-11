import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listMediaByOwner } from "@/lib/media/records";
import StudioList, { type StudioItem } from "@/components/creator/StudioList";
import "@/components/creator/creator.css";

export const instant = false;

export default async function StudioPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login?next=/studio");

  const items: StudioItem[] = (await listMediaByOwner(session.user.id)).map((m) => ({
    id: m.id,
    title: m.title,
    type: m.type,
    visibility: m.visibility,
    unlockPriceCents: m.unlockPriceCents,
    status: m.status,
    processingStatus: m.processingStatus,
    processingError: m.processingError,
    flagReason: m.flagReason,
  }));

  return (
    <main className="creator-shell">
      <div className="creator-inner">
        <nav className="creator-nav">
          <Link href="/">Browse</Link>
          <Link href="/upload">Upload</Link>
        </nav>
        <h1>My studio</h1>
        <p className="creator-sub">Manage what you have posted.</p>
        <StudioList items={items} />
      </div>
    </main>
  );
}
