import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getTransaction, type TransactionStatus } from "@/lib/payments/records";
import "@/components/creator/creator.css";

export const instant = false;

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const STATUS_TEXT: Record<TransactionStatus, string> = {
  pending: "Your payment is being processed. This page shows the latest status when you reload it.",
  completed: "Payment complete. Your access is active.",
  failed: "The payment failed. You have not been charged; you can try again.",
  refunded: "This payment was refunded, so it gives no access (any access it granted has been removed).",
  chargeback: "This payment was disputed, so it gives no access (any access it granted has been removed).",
};

export default async function CheckoutResultPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const txId = first(params.tx);
  const cancelled = first(params.cancelled) === "1";

  const session = await getSession();
  if (!session?.user?.id) {
    redirect(`/login?next=${encodeURIComponent(`/checkout/result?${new URLSearchParams(txId ? { tx: txId } : {})}`)}`);
  }

  const tx = txId ? await getTransaction(txId) : null;
  const mine = tx && tx.buyerId === session.user.id ? tx : null;
  const message = !mine
    ? null
    : cancelled && mine.status === "pending"
      ? "Checkout was cancelled. You have not been charged."
      : STATUS_TEXT[mine.status];

  return (
    <main className="creator-shell">
      <div className="creator-inner">
        <h1>Payment status</h1>
        {mine ? (
          <p role="status" className={mine.status === "completed" ? "creator-ok" : undefined} data-status={mine.status}>
            {message}
          </p>
        ) : (
          <p role="alert" className="creator-error">
            We could not find that payment.
          </p>
        )}
        <nav className="creator-nav">
          <Link href="/">Continue browsing</Link>
        </nav>
      </div>
    </main>
  );
}
