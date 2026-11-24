const express = require("express");
const router = express.Router();
const db = require("../models");
const { validateToken, isAdmin } = require("../middlewares/AuthMiddleware");
const {
  retryProdigiFulfillmentForOrder,
} = require("../services/orderFulfillmentService");
const {
  fetchProdigiOrder,
  extractProdigiTotalCostPence,
  extractProdigiTracking,
} = require("../services/prodigiService");
const { reconcileOrderCharityLedger } = require("../services/profitLedgerService");

/**
 * GET /orders (Admin Only)
 * Lists all store orders with line items, designs, variants, and charity allocations.
 */
router.get("/", validateToken, isAdmin, async (req, res) => {
  try {
    const orders = await db.Order.findAll({
      include: [
        {
          model: db.OrderItem,
          include: [
            { model: db.Design, attributes: ["id", "title", "image_url"] },
            {
              model: db.ProductVariant,
              include: [{ model: db.Product, attributes: ["id", "name"] }],
            },
            { model: db.Charity, attributes: ["id", "name"] },
          ],
        },
        { model: db.Charity, as: "OrderCharity", attributes: ["id", "name"] },
        { model: db.CharityLedger },
      ],
      order: [["createdAt", "DESC"]],
      limit: 200,
    });

    res.json(orders);
  } catch (err) {
    console.error("Error fetching admin orders:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/**
 * POST /orders/:id/retry-prodigi (Admin Only)
 * Submits an already-paid order to Prodigi v4 if initial submission was deferred or failed.
 */
router.post("/:id/retry-prodigi", validateToken, isAdmin, async (req, res) => {
  try {
    const updatedOrder = await retryProdigiFulfillmentForOrder(Number(req.params.id));
    res.json({
      message: "Order submitted to Prodigi successfully",
      order: updatedOrder,
    });
  } catch (err) {
    console.error("Retry Prodigi fulfillment failed:", err);
    res.status(err.statusCode || 500).json({
      error: err.message || "Failed to submit order to Prodigi",
    });
  }
});

/**
 * POST /orders/:id/sync-prodigi (Admin Only)
 * Polls GET /v4.0/orders/{prodigi_order_id} directly to pull latest stage,
 * tracking URL, and confirmed Prodigi cost (useful when testing locally without public webhooks).
 */
router.post("/:id/sync-prodigi", validateToken, isAdmin, async (req, res) => {
  try {
    const order = await db.Order.findByPk(req.params.id);
    if (!order || !order.prodigi_order_id) {
      return res.status(400).json({
        error: "Order does not have a Prodigi Order ID yet.",
      });
    }

    const prodigiOrder = await fetchProdigiOrder(order.prodigi_order_id);
    const stage = prodigiOrder.status?.stage || order.prodigi_stage;
    const costPence = extractProdigiTotalCostPence(prodigiOrder);
    const { trackingNumber, trackingUrl } = extractProdigiTracking(prodigiOrder);

    let nextStatus = order.status;
    if (stage === "Complete") nextStatus = "shipped";
    else if (stage === "Cancelled") nextStatus = "cancelled";
    else if (stage === "InProgress") nextStatus = "in_production";

    await order.update({
      prodigi_stage: stage,
      prodigi_cost_pence: costPence > 0 ? costPence : order.prodigi_cost_pence,
      tracking_number: trackingNumber || order.tracking_number,
      tracking_url: trackingUrl || order.tracking_url,
      status: nextStatus,
    });

    await reconcileOrderCharityLedger(db, order.id, {
      ledgerStatus: stage === "Complete" || costPence > 0 ? "accrued" : undefined,
    });

    res.json({ message: "Synced Prodigi status and reconciled charity ledger", order });
  } catch (err) {
    console.error("Sync Prodigi order failed:", err);
    res.status(500).json({ error: err.message || "Failed to sync with Prodigi" });
  }
});

module.exports = router;
