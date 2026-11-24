const Stripe = require("stripe");

function getStripeClient() {
  const secretKey = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (
    !secretKey ||
    secretKey === "sk_test_replace_with_your_stripe_sandbox_secret_key"
  ) {
    const err = new Error(
      "STRIPE_SECRET_KEY is not configured in server/.env. Paste your Provi-Prints sandbox secret key (sk_test_...) into server/.env."
    );
    err.statusCode = 500;
    err.isClientSafe = true;
    throw err;
  }

  return new Stripe(secretKey);
}

/**
 * Retrieves the exact Stripe processing fee in integer pence for a PaymentIntent
 * by expanding latest_charge.balance_transaction. Falls back to standard UK domestic
 * card fee estimate (1.5% + 20p) if balance_transaction is not yet settled.
 *
 * @param {import('stripe').Stripe} stripe
 * @param {string | import('stripe').Stripe.PaymentIntent | null} paymentIntentRef
 * @param {number} amountTotalPence
 * @returns {Promise<{ paymentIntentId: string | null, stripeFeePence: number }>}
 */
async function resolveStripeFeePence(stripe, paymentIntentRef, amountTotalPence) {
  if (!paymentIntentRef) {
    return {
      paymentIntentId: null,
      stripeFeePence: amountTotalPence > 0 ? Math.round(amountTotalPence * 0.015) + 20 : 0,
    };
  }

  const paymentIntentId =
    typeof paymentIntentRef === "string" ? paymentIntentRef : paymentIntentRef.id;

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });

    const charge = pi.latest_charge;
    if (
      charge &&
      typeof charge === "object" &&
      charge.balance_transaction &&
      typeof charge.balance_transaction === "object" &&
      typeof charge.balance_transaction.fee === "number"
    ) {
      return {
        paymentIntentId,
        stripeFeePence: charge.balance_transaction.fee,
      };
    }
  } catch (err) {
    console.warn("[Stripe] Could not expand balance_transaction fee, using UK fallback:", err.message);
  }

  return {
    paymentIntentId,
    stripeFeePence: amountTotalPence > 0 ? Math.round(amountTotalPence * 0.015) + 20 : 0,
  };
}

module.exports = {
  getStripeClient,
  resolveStripeFeePence,
};
