const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const router = express.Router();
const db = require("../models");
const { JWT_SECRET, isTokenRevoked } = require("../middlewares/AuthMiddleware");
const { getStripeClient } = require("../services/stripeService");
const { fulfillPaidStripeSession } = require("../services/orderFulfillmentService");
const { getConfiguredProfitSharePercent } = require("../services/profitLedgerService");

function generateOrderNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `PP-${datePart}-${randPart}`;
}

async function resolveOptionalCustomer(req) {
  const token = req.cookies?.accessToken;
  if (!token || isTokenRevoked(token)) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    const user = await db.User.findByPk(decoded.id, {
      attributes: ["id", "username", "email", "stripe_customer_id"],
    });
    return user || null;
  } catch {
    return null;
  }
}

/**
 * POST /checkout/create-session
 * Creates a pending local Order + OrderItems (with per-order or per-item charity bindings)
 * and initializes a Hosted Stripe Checkout Session in GBP with UK shipping collection.
 */
router.post("/create-session", async (req, res) => {
  const { items, charityMode, orderCharityId } = req.body || {};

  if (!Array.isArray(items) || items.length === 0 || items.length > 30) {
    return res.status(400).json({
      error: "Please provide between 1 and 30 basket items.",
    });
  }

  const mode = charityMode === "per_order" ? "per_order" : "per_item";

  try {
    const stripe = getStripeClient();
    const customerUser = await resolveOptionalCustomer(req);

    // Load active charities map
    const activeCharities = await db.Charity.findAll({
      where: { is_active: true },
    });
    const charityMap = new Map(activeCharities.map((c) => [c.id, c]));

    let resolvedOrderCharity = null;
    if (mode === "per_order") {
      const parsedOrderCharityId = Number(orderCharityId);
      resolvedOrderCharity = charityMap.get(parsedOrderCharityId) || null;
      if (!resolvedOrderCharity) {
        return res.status(400).json({
          error: "Please select an active charity to support for your order.",
        });
      }
    }

    // Validate each line item against authoritative DB records
    const validatedItems = [];
    let subtotalPence = 0;

    for (const rawItem of items) {
      const designId = Number(rawItem?.designId);
      const variantId = Number(rawItem?.variantId);
      const quantity = Number(rawItem?.quantity);

      if (
        !Number.isInteger(designId) ||
        !Number.isInteger(variantId) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 25
      ) {
        return res.status(400).json({
          error: "Invalid print selection or quantity (must be 1-25 per item).",
        });
      }

      const [design, variant] = await Promise.all([
        db.Design.findByPk(designId),
        db.ProductVariant.findByPk(variantId, {
          include: [{ model: db.Product }],
        }),
      ]);

      if (!design) {
        return res.status(404).json({ error: `Design #${designId} was not found.` });
      }
      if (!variant) {
        return res.status(404).json({ error: `Print format/size #${variantId} was not found.` });
      }

      let itemCharity = resolvedOrderCharity;
      if (mode === "per_item") {
        const parsedItemCharityId = Number(rawItem?.charityId);
        itemCharity = charityMap.get(parsedItemCharityId) || activeCharities[0] || null;
        if (!itemCharity) {
          return res.status(400).json({
            error: `Please select an active charity for "${design.title}".`,
          });
        }
      }

      const lineTotalPence = variant.price_pence * quantity;
      subtotalPence += lineTotalPence;

      validatedItems.push({
        design,
        variant,
        productName: variant.Product ? variant.Product.name : "Archival Print",
        charity: itemCharity,
        quantity,
        unitPricePence: variant.price_pence,
        lineTotalPence,
      });
    }

    const orderNumber = generateOrderNumber();

    // Persist pending Order + OrderItems inside a transaction
    const order = await db.sequelize.transaction(async (t) => {
      const createdOrder = await db.Order.create(
        {
          order_number: orderNumber,
          userId: customerUser ? customerUser.id : null,
          customer_email: customerUser ? customerUser.email : null,
          charity_selection_mode: mode,
          orderCharityId: resolvedOrderCharity ? resolvedOrderCharity.id : null,
          subtotal_pence: subtotalPence,
          total_paid_pence: subtotalPence,
          status: "pending_payment",
        },
        { transaction: t }
      );

      await db.OrderItem.bulkCreate(
        validatedItems.map((vi) => ({
          orderId: createdOrder.id,
          designId: vi.design.id,
          productVariantId: vi.variant.id,
          charityId: vi.charity ? vi.charity.id : null,
          quantity: vi.quantity,
          unit_price_pence: vi.unitPricePence,
          line_total_pence: vi.lineTotalPence,
          prodigi_sku_snapshot: vi.variant.prodigi_sku || "GLOBAL-PAP-A4",
          estimated_unit_cost_pence: vi.variant.estimated_cost_pence || 0,
        })),
        { transaction: t }
      );

      return createdOrder;
    });

    // Build UK Commercial Participation Solicitation Statement for Stripe Checkout UI
    const uniqueCharityNames = Array.from(
      new Set(validatedItems.map((vi) => vi.charity?.name).filter(Boolean))
    );
    const profitSharePct = getConfiguredProfitSharePercent();
    const charityLabelList =
      uniqueCharityNames.length <= 2
        ? uniqueCharityNames.join(" & ")
        : `${uniqueCharityNames.slice(0, 2).join(", ")} + ${uniqueCharityNames.length - 2} more`;

    const solicitationMessage = `${profitSharePct}% of net profits from your order (after print production & payment processing costs) will be donated to ${charityLabelList}.`;

    const clientUrl = (
      process.env.CLIENT_URL ||
      (process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",")[0].trim() : "") ||
      "http://localhost:5173"
    ).replace(/\/+$/, "");

    const stripeLineItems = validatedItems.map((vi) => {
      const hasPublicHttpsImage =
        typeof vi.design.image_url === "string" &&
        vi.design.image_url.startsWith("https://");

      return {
        quantity: vi.quantity,
        price_data: {
          currency: "gbp",
          unit_amount: vi.unitPricePence,
          product_data: {
            name: `${vi.design.title} — ${vi.productName}`,
            description: `${vi.variant.description}${
              vi.charity ? ` • Supports ${vi.charity.name}` : ""
            }`,
            ...(hasPublicHttpsImage ? { images: [vi.design.image_url] } : {}),
            metadata: {
              design_id: String(vi.design.id),
              variant_id: String(vi.variant.id),
              prodigi_sku: vi.variant.prodigi_sku,
              charity_id: vi.charity ? String(vi.charity.id) : "",
            },
          },
        },
      };
    });

    const sessionParams = {
      mode: "payment",
      client_reference_id: String(order.id),
      line_items: stripeLineItems,
      shipping_address_collection: {
        allowed_countries: ["GB"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: {
              amount: 0,
              currency: "gbp",
            },
            display_name: "Free UK Standard Print Delivery",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 3 },
              maximum: { unit: "business_day", value: 6 },
            },
          },
        },
      ],
      custom_text: {
        submit: {
          message: solicitationMessage.slice(0, 500),
        },
      },
      metadata: {
        order_id: String(order.id),
        order_number: order.order_number,
        charity_selection_mode: mode,
        order_charity_id: resolvedOrderCharity ? String(resolvedOrderCharity.id) : "",
      },
      success_url: `${clientUrl}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/?checkout=cancelled`,
    };

    if (customerUser?.stripe_customer_id) {
      sessionParams.customer = customerUser.stripe_customer_id;
    } else if (customerUser?.email) {
      sessionParams.customer_email = customerUser.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    await order.update({ stripe_session_id: session.id });

    return res.status(201).json({
      sessionId: session.id,
      url: session.url,
      orderNumber: order.order_number,
    });
  } catch (err) {
    console.error("[Checkout] Failed to create Stripe Checkout session:", err);
    if (err.isClientSafe) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
    return res.status(500).json({
      error: "Unable to initialize Stripe Checkout. Please check server configuration.",
    });
  }
});

/**
 * GET /checkout/session/:sessionId
 * Retrieves sanitized Order confirmation details for the customer after Stripe redirect.
 * If the local Order is still 'pending_payment' (e.g., before local webhook delivery),
 * proactively verifies the session with Stripe and runs idempotent fulfillment.
 */
router.get("/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId || typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
    return res.status(400).json({ error: "Invalid checkout session ID" });
  }

  try {
    let order = await db.Order.findOne({
      where: { stripe_session_id: sessionId },
      include: [
        {
          model: db.OrderItem,
          include: [
            { model: db.Design, attributes: ["id", "title", "image_url"] },
            { model: db.ProductVariant, include: [{ model: db.Product, attributes: ["id", "name"] }] },
            { model: db.Charity, attributes: ["id", "name", "charity_reg_number", "logo_url"] },
          ],
        },
        { model: db.Charity, as: "OrderCharity", attributes: ["id", "name", "charity_reg_number", "logo_url"] },
        {
          model: db.CharityLedger,
          include: [{ model: db.Charity, attributes: ["id", "name", "charity_reg_number", "logo_url"] }],
        },
      ],
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found for this checkout session" });
    }

    // Proactive sync if customer lands on /order-success before webhook arrives
    if (order.status === "pending_payment") {
      try {
        const stripe = getStripeClient();
        const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
        if (stripeSession.payment_status === "paid") {
          const syncedOrder = await fulfillPaidStripeSession(stripeSession);
          if (syncedOrder) {
            order = syncedOrder;
          }
        }
      } catch (syncErr) {
        console.warn("[Checkout] Proactive session sync warning:", syncErr.message);
      }
    }

    return res.json({
      orderNumber: order.order_number,
      status: order.status,
      prodigiStage: order.prodigi_stage,
      customerName: order.customer_name,
      charitySelectionMode: order.charity_selection_mode,
      subtotalPence: order.subtotal_pence,
      shippingPence: order.shipping_pence,
      totalPaidPence: order.total_paid_pence,
      charityProfitPence: order.charity_profit_pence,
      trackingUrl: order.tracking_url,
      items: (order.OrderItems || []).map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPricePence: item.unit_price_pence,
        lineTotalPence: item.line_total_pence,
        allocatedProfitPence: item.allocated_profit_pence,
        designTitle: item.Design?.title || "Archival Print",
        designImageUrl: item.Design?.image_url || "",
        variantDescription: item.ProductVariant?.description || "",
        productName: item.ProductVariant?.Product?.name || "Print",
        charity: item.Charity
          ? {
              id: item.Charity.id,
              name: item.Charity.name,
              charityRegNumber: item.Charity.charity_reg_number,
              logoUrl: item.Charity.logo_url,
            }
          : null,
      })),
    });
  } catch (err) {
    console.error("[Checkout] Failed to load session summary:", err);
    return res.status(500).json({ error: "Failed to load order confirmation" });
  }
});

module.exports = router;
