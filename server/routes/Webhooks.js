const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const db = require("../models");
const { getStripeClient } = require("../services/stripeService");
const { fulfillPaidStripeSession } = require("../services/orderFulfillmentService");
const {
  extractProdigiTotalCostPence,
  extractProdigiTracking,
} = require("../services/prodigiService");
const {
  reconcileOrderCharityLedger,
  reverseOrderCharityLedger,
} = require("../services/profitLedgerService");

/**
 * POST /webhooks/stripe
 * IMPORTANT: Uses express.raw() so Stripe signature verification receives the exact raw Buffer.
 */
router.post(
  "/stripe",
  express.raw({ type: "application/json", limit: "256kb" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();

    if (
      !webhookSecret ||
      webhookSecret === "whsec_replace_with_your_stripe_webhook_secret"
    ) {
      return res.status(500).json({
        error: "STRIPE_WEBHOOK_SECRET is not configured on the server.",
      });
    }

    if (!sig) {
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    let event;
    try {
      const stripe = getStripeClient();
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("[Stripe Webhook] Signature verification failed:", err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object;
          await fulfillPaidStripeSession(session);
          break;
        }

        case "checkout.session.expired": {
          const expiredSession = event.data.object;
          if (expiredSession?.id) {
            await db.Order.update(
              { status: "cancelled" },
              {
                where: {
                  stripe_session_id: expiredSession.id,
                  status: "pending_payment",
                },
              }
            );
          }
          break;
        }

        case "charge.refunded": {
          const charge = event.data.object;
          const paymentIntentId =
            typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : charge.payment_intent?.id;

          if (paymentIntentId) {
            const order = await db.Order.findOne({
              where: { stripe_payment_intent_id: paymentIntentId },
            });
            if (order) {
              await order.update({ status: "refunded" });
              await reverseOrderCharityLedger(
                db,
                order.id,
                "Stripe charge refunded"
              );
            }
          }
          break;
        }

        default:
          break;
      }

      return res.json({ received: true });
    } catch (err) {
      console.error(`[Stripe Webhook] Error handling ${event.type}:`, err);
      return res.status(500).json({ error: "Webhook handler failed" });
    }
  }
);

/**
 * POST /webhooks/prodigi
 * Receives Prodigi v4 CloudEvents callbacks (order.status.stage.changed)
 * to update tracking details, exact Prodigi fulfillment + shipping charges,
 * and promote CharityLedger entries from 'estimated' to 'accrued'.
 */
router.post(
  "/prodigi",
  express.json({ limit: "256kb" }),
  async (req, res) => {
    const configuredSecret = (process.env.PRODIGI_WEBHOOK_SECRET || "").trim();
    const shouldCheckSecret =
      Boolean(configuredSecret) &&
      configuredSecret !== "replace_with_random_prodigi_webhook_secret";

    if (shouldCheckSecret) {
      const providedToken = String(
        req.query.token || req.headers["x-prodigi-webhook-secret"] || ""
      );
      const expectedBuf = Buffer.from(configuredSecret);
      const providedBuf = Buffer.from(providedToken);
      if (
        expectedBuf.length !== providedBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, providedBuf)
      ) {
        return res.status(401).json({ error: "Invalid Prodigi webhook secret" });
      }
    }

    try {
      const prodigiOrder = req.body?.data?.order || req.body?.order;
      if (!prodigiOrder || (!prodigiOrder.id && !prodigiOrder.merchantReference)) {
        return res.status(400).json({ error: "Missing Prodigi order payload" });
      }

      const order = await db.Order.findOne({
        where: prodigiOrder.id
          ? { prodigi_order_id: prodigiOrder.id }
          : { order_number: prodigiOrder.merchantReference },
      });

      if (!order) {
        return res.status(200).json({ received: true, matched: false });
      }

      const stage = prodigiOrder.status?.stage || order.prodigi_stage;
      const confirmedCostPence = extractProdigiTotalCostPence(prodigiOrder);
      const { trackingNumber, trackingUrl } = extractProdigiTracking(prodigiOrder);

      let nextStatus = order.status;
      if (stage === "Complete") {
        nextStatus = "shipped";
      } else if (stage === "Cancelled") {
        nextStatus = "cancelled";
      } else if (stage === "InProgress" && order.status === "paid") {
        nextStatus = "in_production";
      }

      await order.update({
        prodigi_order_id: prodigiOrder.id || order.prodigi_order_id,
        prodigi_stage: stage,
        prodigi_cost_pence:
          confirmedCostPence > 0 ? confirmedCostPence : order.prodigi_cost_pence,
        tracking_number: trackingNumber || order.tracking_number,
        tracking_url: trackingUrl || order.tracking_url,
        status: nextStatus,
      });

      if (stage === "Cancelled") {
        await reverseOrderCharityLedger(db, order.id, "Prodigi order cancelled");
      } else {
        await reconcileOrderCharityLedger(db, order.id, {
          ledgerStatus: stage === "Complete" ? "accrued" : undefined,
        });
      }

      return res.json({ received: true, matched: true });
    } catch (err) {
      console.error("[Prodigi Webhook] Error processing callback:", err);
      return res.status(500).json({ error: "Failed to process Prodigi webhook" });
    }
  }
);

module.exports = router;
