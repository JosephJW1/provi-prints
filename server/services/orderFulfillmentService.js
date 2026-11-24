const db = require("../models");
const { getStripeClient, resolveStripeFeePence } = require("./stripeService");
const { submitOrderToProdigi } = require("./prodigiService");
const { reconcileOrderCharityLedger } = require("./profitLedgerService");

function buildProdigiCallbackUrl() {
  const publicApiBase = (process.env.PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (!publicApiBase.startsWith("https://")) {
    return undefined;
  }
  const secret = (process.env.PRODIGI_WEBHOOK_SECRET || "").trim();
  const hasRealSecret =
    secret && secret !== "replace_with_random_prodigi_webhook_secret";

  return hasRealSecret
    ? `${publicApiBase}/webhooks/prodigi?token=${encodeURIComponent(secret)}`
    : `${publicApiBase}/webhooks/prodigi`;
}

/**
 * Idempotently processes a paid Stripe Checkout Session:
 * 1. Marks the Order as paid and stores customer/shipping details + exact Stripe fee
 * 2. Submits the print order to Prodigi API v4 (using 48h presigned R2 master URLs)
 * 3. Computes net profit and creates initial CharityLedger entries
 *
 * Safe to invoke from both POST /webhooks/stripe and GET /checkout/session/:sessionId.
 *
 * @param {import('stripe').Stripe.Checkout.Session} session
 * @returns {Promise<any>}
 */
async function fulfillPaidStripeSession(session) {
  if (!session || session.payment_status !== "paid") {
    return null;
  }

  const order = await db.Order.findOne({
    where: { stripe_session_id: session.id },
    include: [
      {
        model: db.OrderItem,
        include: [{ model: db.Design }, { model: db.ProductVariant }, { model: db.Charity }],
      },
      { model: db.Charity, as: "OrderCharity" },
    ],
  });

  if (!order) {
    console.warn(`[Fulfillment] No local Order found for Stripe session ${session.id}`);
    return null;
  }

  // Already fulfilled or further along — return immediately (idempotent)
  if (
    order.status !== "pending_payment" &&
    (order.prodigi_order_id || order.status === "shipped" || order.status === "refunded")
  ) {
    return order;
  }

  const stripe = getStripeClient();
  const amountTotalPence =
    typeof session.amount_total === "number" ? session.amount_total : order.subtotal_pence;
  const shippingCostPence = session.shipping_cost?.amount_total ?? 0;

  const shippingDetails =
    session.collected_information?.shipping_details ||
    session.shipping_details ||
    null;
  const customerDetails = session.customer_details || null;

  const addressObj = shippingDetails?.address || customerDetails?.address || null;
  const customerName =
    shippingDetails?.name || customerDetails?.name || order.customer_name || "Customer";
  const customerEmail = customerDetails?.email || order.customer_email || null;

  const { paymentIntentId, stripeFeePence } = await resolveStripeFeePence(
    stripe,
    session.payment_intent,
    amountTotalPence
  );

  await order.update({
    status: order.status === "pending_payment" ? "paid" : order.status,
    customer_name: customerName,
    customer_email: customerEmail,
    shipping_address_json: addressObj || order.shipping_address_json,
    shipping_pence: shippingCostPence,
    total_paid_pence: amountTotalPence,
    stripe_payment_intent_id: paymentIntentId || order.stripe_payment_intent_id,
    stripe_fee_pence: stripeFeePence,
  });

  // Submit to Prodigi if not yet submitted
  if (!order.prodigi_order_id) {
    try {
      const { prodigiOrder, costPence } = await submitOrderToProdigi({
        order,
        orderItems: order.OrderItems || [],
        callbackUrl: buildProdigiCallbackUrl(),
      });

      await order.update({
        prodigi_order_id: prodigiOrder.id || null,
        prodigi_stage: prodigiOrder.status?.stage || "InProgress",
        prodigi_cost_pence: costPence > 0 ? costPence : order.prodigi_cost_pence,
        status: "in_production",
        fulfillment_error_message: null,
      });
    } catch (prodigiErr) {
      console.warn(`[Fulfillment] Prodigi submission deferred/failed for ${order.order_number}:`, prodigiErr.message);
      await order.update({
        status: prodigiErr.code === "PRODIGI_NOT_CONFIGURED" ? "paid" : "fulfillment_error",
        fulfillment_error_message: prodigiErr.message,
      });
    }
  }

  // Reconcile Charity Profit Ledger (uses confirmed Prodigi cost if returned, or variant estimate)
  await reconcileOrderCharityLedger(db, order.id);

  return db.Order.findByPk(order.id, {
    include: [
      {
        model: db.OrderItem,
        include: [{ model: db.Design }, { model: db.ProductVariant }, { model: db.Charity }],
      },
      { model: db.Charity, as: "OrderCharity" },
      { model: db.CharityLedger, include: [{ model: db.Charity }] },
    ],
  });
}

/**
 * Retries Prodigi submission for an already-paid order (invoked from Admin Orders page).
 *
 * @param {number} orderId
 */
async function retryProdigiFulfillmentForOrder(orderId) {
  const order = await db.Order.findByPk(orderId, {
    include: [
      {
        model: db.OrderItem,
        include: [{ model: db.Design }, { model: db.ProductVariant }],
      },
    ],
  });

  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (order.status === "pending_payment" || order.status === "refunded") {
    const err = new Error(`Cannot submit order in '${order.status}' status to Prodigi`);
    err.statusCode = 400;
    throw err;
  }

  if (order.prodigi_order_id) {
    return order;
  }

  const { prodigiOrder, costPence } = await submitOrderToProdigi({
    order,
    orderItems: order.OrderItems || [],
    callbackUrl: buildProdigiCallbackUrl(),
  });

  await order.update({
    prodigi_order_id: prodigiOrder.id || null,
    prodigi_stage: prodigiOrder.status?.stage || "InProgress",
    prodigi_cost_pence: costPence > 0 ? costPence : order.prodigi_cost_pence,
    status: "in_production",
    fulfillment_error_message: null,
  });

  await reconcileOrderCharityLedger(db, order.id);
  return order;
}

module.exports = {
  fulfillPaidStripeSession,
  retryProdigiFulfillmentForOrder,
};
