/**
 * Calculates exact net profit (in GBP pence) and splits the charity share
 * across either a single order-level charity ('per_order') or individual
 * print line items ('per_item') using the Largest Remainder Method so
 * integer pence always sum exactly to charityProfitPence.
 */

function getConfiguredProfitSharePercent() {
  const raw = Number(process.env.CHARITY_PROFIT_SHARE_PERCENT);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 100) {
    return raw;
  }
  return 100;
}

/**
 * Pure calculation helper for unit testing and database reconciliation.
 *
 * @param {object} params
 * @param {number} params.totalPaidPence
 * @param {number} params.stripeFeePence
 * @param {number} params.prodigiCostPence
 * @param {number} [params.profitSharePercent=100]
 * @param {'per_order' | 'per_item'} params.charitySelectionMode
 * @param {number | null} params.orderCharityId
 * @param {Array<{ id: number, line_total_pence: number, charityId: number | null }>} params.orderItems
 * @returns {{
 *   netProfitPence: number,
 *   charityProfitPence: number,
 *   itemAllocations: Array<{ orderItemId: number, charityId: number | null, allocatedProfitPence: number }>
 * }}
 */
function calculateCharityAllocations({
  totalPaidPence,
  stripeFeePence,
  prodigiCostPence,
  profitSharePercent = getConfiguredProfitSharePercent(),
  charitySelectionMode,
  orderCharityId,
  orderItems,
}) {
  const safePaid = Math.max(0, Math.round(totalPaidPence || 0));
  const safeStripeFee = Math.max(0, Math.round(stripeFeePence || 0));
  const safeProdigiCost = Math.max(0, Math.round(prodigiCostPence || 0));

  const netProfitPence = Math.max(0, safePaid - safeStripeFee - safeProdigiCost);
  const charityProfitPence = Math.max(
    0,
    Math.round((netProfitPence * profitSharePercent) / 100)
  );

  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return {
      netProfitPence,
      charityProfitPence,
      itemAllocations: [],
    };
  }

  const totalItemsPence = orderItems.reduce(
    (sum, item) => sum + Math.max(0, item.line_total_pence || 0),
    0
  );

  // Proportional split across items using Largest Remainder Method (Hare-Niemeyer)
  const rawShares = orderItems.map((item, idx) => {
    const weight =
      totalItemsPence > 0
        ? Math.max(0, item.line_total_pence || 0) / totalItemsPence
        : 1 / orderItems.length;
    const exact = charityProfitPence * weight;
    const floored = Math.floor(exact);
    const resolvedCharityId =
      charitySelectionMode === "per_order" && orderCharityId
        ? orderCharityId
        : item.charityId || orderCharityId || null;

    return {
      idx,
      orderItemId: item.id,
      charityId: resolvedCharityId,
      floored,
      remainder: exact - floored,
    };
  });

  let remainderPence =
    charityProfitPence - rawShares.reduce((sum, s) => sum + s.floored, 0);

  rawShares.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.idx - b.idx;
  });

  for (let i = 0; i < rawShares.length && remainderPence > 0; i++) {
    rawShares[i].floored += 1;
    remainderPence -= 1;
  }

  rawShares.sort((a, b) => a.idx - b.idx);

  return {
    netProfitPence,
    charityProfitPence,
    itemAllocations: rawShares.map((s) => ({
      orderItemId: s.orderItemId,
      charityId: s.charityId,
      allocatedProfitPence: s.floored,
    })),
  };
}

/**
 * Reconciles an Order's net profit and updates/creates CharityLedger entries.
 * Uses actual prodigi_cost_pence when available (> 0), or falls back to
 * item estimated_unit_cost_pence while ledger entries are in 'estimated' status.
 *
 * @param {any} db - Sequelize models bundle
 * @param {number} orderId
 * @param {object} [options]
 * @param {'estimated' | 'accrued'} [options.ledgerStatus]
 */
async function reconcileOrderCharityLedger(db, orderId, options = {}) {
  const order = await db.Order.findByPk(orderId, {
    include: [
      { model: db.OrderItem },
      { model: db.CharityLedger },
    ],
  });

  if (!order) {
    return null;
  }

  const items = order.OrderItems || [];
  const estimatedFallbackCost = items.reduce(
    (sum, item) => sum + (item.estimated_unit_cost_pence || 0) * (item.quantity || 1),
    0
  );

  const hasConfirmedProdigiCost = order.prodigi_cost_pence > 0;
  const effectiveProdigiCostPence = hasConfirmedProdigiCost
    ? order.prodigi_cost_pence
    : estimatedFallbackCost;

  const targetStatus =
    options.ledgerStatus ||
    (order.status === "shipped" || hasConfirmedProdigiCost ? "accrued" : "estimated");

  const { netProfitPence, charityProfitPence, itemAllocations } =
    calculateCharityAllocations({
      totalPaidPence: order.total_paid_pence,
      stripeFeePence: order.stripe_fee_pence,
      prodigiCostPence: effectiveProdigiCostPence,
      charitySelectionMode: order.charity_selection_mode,
      orderCharityId: order.orderCharityId,
      orderItems: items,
    });

  await order.update({
    net_profit_pence: netProfitPence,
    charity_profit_pence: charityProfitPence,
  });

  // Update per-item allocated_profit_pence
  for (const alloc of itemAllocations) {
    await db.OrderItem.update(
      { allocated_profit_pence: alloc.allocatedProfitPence },
      { where: { id: alloc.orderItemId } }
    );
  }

  // Do not overwrite ledger entries that have already been disbursed ('paid')
  const existingLedgers = order.CharityLedgers || [];
  const hasPaidEntries = existingLedgers.some((entry) => entry.status === "paid");
  if (hasPaidEntries) {
    return order;
  }

  // Replace non-paid ledger entries cleanly inside a transaction
  await db.sequelize.transaction(async (t) => {
    await db.CharityLedger.destroy({
      where: {
        orderId: order.id,
        status: ["estimated", "accrued"],
      },
      transaction: t,
    });

    const newRows = itemAllocations
      .filter((a) => a.charityId && a.allocatedProfitPence > 0)
      .map((a) => ({
        charityId: a.charityId,
        orderId: order.id,
        orderItemId: a.orderItemId,
        amount_pence: a.allocatedProfitPence,
        currency: "gbp",
        status: targetStatus,
        notes:
          targetStatus === "accrued"
            ? `Finalized profit allocation for ${order.order_number}`
            : `Estimated profit allocation for ${order.order_number} (pending Prodigi final invoice)`,
      }));

    if (newRows.length > 0) {
      await db.CharityLedger.bulkCreate(newRows, { transaction: t });
    }
  });

  return order;
}

/**
 * Reverses unpaid CharityLedger entries when an order is refunded or cancelled.
 *
 * @param {any} db
 * @param {number} orderId
 * @param {string} reason
 */
async function reverseOrderCharityLedger(db, orderId, reason = "Order refunded") {
  await db.CharityLedger.update(
    {
      status: "reversed",
      notes: reason,
    },
    {
      where: {
        orderId,
        status: ["estimated", "accrued"],
      },
    }
  );
}

module.exports = {
  getConfiguredProfitSharePercent,
  calculateCharityAllocations,
  reconcileOrderCharityLedger,
  reverseOrderCharityLedger,
};
