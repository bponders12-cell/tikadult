import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listMediaByOwner } from "@/lib/media/records";
import { getCreatorPricing } from "@/lib/payments/pricing";
import StudioList, { type StudioItem } from "@/components/creator/StudioList";
import CollectionPricingForm from "@/components/payments/CollectionPricingForm";
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
  const pricing = await getCreatorPricing(session.user.id);

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
        <h2>Private collection pricing</h2>
        <p className="creator-sub">
          Let fans unlock all of your private and restricted posts at once. Leave a price empty to not offer
          that option. Access does not renew automatically.
        </p>
        <CollectionPricingForm initial={pricing} />
      </div>
    </main>
  );
}
