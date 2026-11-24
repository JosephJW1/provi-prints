const { getProdigiMasterAssetUrl } = require("./storageService");

const DEFAULT_PRODIGI_SANDBOX_URL = "https://api.sandbox.prodigi.com/v4.0";

function getProdigiConfig() {
  const baseUrl = (process.env.PRODIGI_API_URL || DEFAULT_PRODIGI_SANDBOX_URL).replace(/\/+$/, "");
  const apiKey = (process.env.PRODIGI_API_KEY || "").trim();
  const isConfigured =
    Boolean(apiKey) && apiKey !== "replace_with_your_prodigi_sandbox_api_key";

  return { baseUrl, apiKey, isConfigured };
}

/**
 * Extracts total fulfillment + shipping charges in integer GBP pence from a Prodigi v4 order object.
 * Prodigi returns charges[].totalCost = { amount: "12.45", currency: "GBP" }.
 *
 * @param {any} prodigiOrder
 * @returns {number}
 */
function extractProdigiTotalCostPence(prodigiOrder) {
  if (!prodigiOrder || !Array.isArray(prodigiOrder.charges)) {
    return 0;
  }

  let totalPence = 0;
  for (const charge of prodigiOrder.charges) {
    const rawAmount = charge?.totalCost?.amount ?? charge?.amount;
    const numeric = Number.parseFloat(rawAmount);
    if (Number.isFinite(numeric) && numeric >= 0) {
      totalPence += Math.round(numeric * 100);
    }
  }
  return totalPence;
}

/**
 * Extracts tracking number and URL from Prodigi shipments array when available.
 *
 * @param {any} prodigiOrder
 * @returns {{ trackingNumber: string | null, trackingUrl: string | null }}
 */
function extractProdigiTracking(prodigiOrder) {
  if (!prodigiOrder || !Array.isArray(prodigiOrder.shipments)) {
    return { trackingNumber: null, trackingUrl: null };
  }

  for (const shipment of prodigiOrder.shipments) {
    const trackingNumber = shipment?.tracking?.number || null;
    const trackingUrl = shipment?.tracking?.url || null;
    if (trackingNumber || trackingUrl) {
      return { trackingNumber, trackingUrl };
    }
  }

  return { trackingNumber: null, trackingUrl: null };
}

/**
 * Resolves the high-res 300 DPI print URL for a Design.
 * Uses a 48-hour Cloudflare R2 presigned URL when privateMasterKey exists,
 * falling back to image_url in sandbox/dev if R2 or privateMasterKey is absent.
 *
 * @param {any} design
 * @returns {Promise<string>}
 */
async function resolvePrintAssetUrl(design) {
  if (design?.privateMasterKey) {
    try {
      return await getProdigiMasterAssetUrl(design.privateMasterKey, 172800);
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw err;
      }
      console.warn(
        `[Prodigi] Falling back to public preview URL in dev because R2 master presign failed: ${err.message}`
      );
    }
  }

  if (design?.image_url) {
    return design.image_url;
  }

  throw new Error(`Design #${design?.id || "unknown"} has no printable asset URL.`);
}

/**
 * Submits a paid Order and its OrderItems (with associated Designs) to Prodigi API v4.
 *
 * @param {object} params
 * @param {any} params.order - Sequelize Order instance
 * @param {Array<any>} params.orderItems - Sequelize OrderItem instances with Design included
 * @param {string} [params.callbackUrl] - Optional public HTTPS webhook callback URL for Prodigi updates
 * @returns {Promise<{ prodigiOrder: any, costPence: number }>}
 */
async function submitOrderToProdigi({ order, orderItems, callbackUrl }) {
  const { baseUrl, apiKey, isConfigured } = getProdigiConfig();

  if (!isConfigured) {
    const err = new Error(
      "PRODIGI_API_KEY is not configured in server/.env. Order is saved as paid and can be retried from Admin once your Prodigi Sandbox key is added."
    );
    err.code = "PRODIGI_NOT_CONFIGURED";
    throw err;
  }

  const addr = order.shipping_address_json || {};
  if (!addr.line1 || !addr.postal_code) {
    throw new Error(
      `Order ${order.order_number} is missing required UK shipping address fields (line1 / postal_code).`
    );
  }

  const prodigiItems = [];
  for (const item of orderItems) {
    const assetUrl = await resolvePrintAssetUrl(item.Design);
    prodigiItems.push({
      merchantReference: `${order.order_number}-ITEM-${item.id}`,
      sku: item.prodigi_sku_snapshot || "GLOBAL-PAP-A4",
      copies: item.quantity,
      sizing: "fillPrintArea",
      assets: [
        {
          printArea: "default",
          url: assetUrl,
        },
      ],
    });
  }

  const payload = {
    merchantReference: order.order_number,
    idempotencyKey: order.stripe_session_id || order.order_number,
    shippingMethod: "Standard",
    recipient: {
      name: order.customer_name || "Provi Prints Customer",
      email: order.customer_email || undefined,
      address: {
        line1: addr.line1,
        line2: addr.line2 || undefined,
        townOrCity: addr.city || "United Kingdom",
        stateOrCounty: addr.state || undefined,
        postalOrZipCode: addr.postal_code,
        countryCode: addr.country || "GB",
      },
    },
    items: prodigiItems,
  };

  if (callbackUrl && callbackUrl.startsWith("https://")) {
    payload.callbackUrl = callbackUrl;
  }

  const response = await fetch(`${baseUrl}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      data?.statusText ||
      (data?.failures ? JSON.stringify(data.failures) : JSON.stringify(data));
    throw new Error(`Prodigi API ${response.status}: ${detail}`);
  }

  const prodigiOrder = data.order || data;
  const costPence = extractProdigiTotalCostPence(prodigiOrder);

  return { prodigiOrder, costPence };
}

/**
 * Fetches the latest Prodigi v4 order state by Prodigi order ID (e.g. ord_xxxxxx).
 *
 * @param {string} prodigiOrderId
 * @returns {Promise<any>}
 */
async function fetchProdigiOrder(prodigiOrderId) {
  const { baseUrl, apiKey, isConfigured } = getProdigiConfig();
  if (!isConfigured) {
    throw new Error("PRODIGI_API_KEY is not configured.");
  }

  const response = await fetch(`${baseUrl}/orders/${encodeURIComponent(prodigiOrderId)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Prodigi GET order failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data.order || data;
}

module.exports = {
  getProdigiConfig,
  submitOrderToProdigi,
  fetchProdigiOrder,
  extractProdigiTotalCostPence,
  extractProdigiTracking,
};
