import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { centsToDollars } from "@/lib/media/format";
import { getFakeCheckoutProvider } from "@/lib/payments/fake-checkout";
import { getTransaction } from "@/lib/payments/records";
import FakeCheckoutActions from "@/components/payments/FakeCheckoutActions";
import "@/components/creator/creator.css";

export const instant = false;

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Dev-only stand-in for a provider's hosted payment page. 404 in production or with a real provider. */
export default async function FakeCheckoutPage({ searchParams }: { searchParams: Search }) {
  if (!getFakeCheckoutProvider()) notFound();
  const txId = first((await searchParams).tx);

  const session = await getSession();
  if (!session?.user?.id) {
    redirect(`/login?next=${encodeURIComponent(`/checkout/fake?${new URLSearchParams(txId ? { tx: txId } : {})}`)}`);
  }

  const tx = txId ? await getTransaction(txId) : null;
  const mine = tx && tx.buyerId === session.user.id ? tx : null;

  return (
    <main className="creator-shell">
      <div className="creator-inner">
        <h1>Test payment</h1>
        <p className="creator-sub">Development only: no money moves.</p>
        {!mine ? (
          <p role="alert" className="creator-error">
            We could not find that payment.
          </p>
        ) : mine.status === "pending" || mine.status === "failed" ? (
          <div className="creator-card">
            <p>
              <strong>${centsToDollars(mine.grossCents)} USD</strong>
            </p>
            <FakeCheckoutActions transactionId={mine.id} />
          </div>
        ) : (
          <p role="status">
            This payment is already {mine.status}.{" "}
            <Link href={`/checkout/result?tx=${encodeURIComponent(mine.id)}`}>See the result</Link>
          </p>
        )}
      </div>
    </main>
  );
}
