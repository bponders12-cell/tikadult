import {
  FAKE_PROVIDER_NAME,
  getPaymentProvider,
  PaymentsNotConfiguredError,
  type PaymentProvider,
} from "@/lib/payments/provider";

/**
 * The fake provider, when the dev-only hosted checkout (/checkout/fake and its simulate endpoint)
 * may be used: never in production, and only while the fake provider is the configured one.
 * Null means "behave as if the page does not exist" (404).
 */
export function getFakeCheckoutProvider(): PaymentProvider | null {
  if (process.env.NODE_ENV === "production") return null;
  try {
    const provider = getPaymentProvider();
    return provider.name === FAKE_PROVIDER_NAME ? provider : null;
  } catch (e) {
    if (e instanceof PaymentsNotConfiguredError) return null;
    throw e;
  }
}
