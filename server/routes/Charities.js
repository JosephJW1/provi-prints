const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const db = require("../models");
const { validateToken, isAdmin } = require("../middlewares/AuthMiddleware");
const {
  generatePayoutBatchCsv,
  triggerOptionalExternalPayouts,
} = require("../services/charityPayoutAdapter");

const VALID_PROVIDERS = ["manual_batch", "work_for_good", "wise", "goodstack"];

/**
 * GET /charities (Public)
 * Returns active charities with public metadata only (excludes bank account fields).
 */
router.get("/", async (req, res) => {
  try {
    const charities = await db.Charity.findAll({
      where: { is_active: true },
      attributes: [
        "id",
        "name",
        "charity_reg_number",
        "logo_url",
        "description",
        "townId",
      ],
      include: [
        {
          model: db.Towns,
          attributes: ["id", "townName"],
        },
      ],
      order: [["id", "ASC"]],
    });
    res.json(charities);
  } catch (err) {
    console.error("Error fetching public charities:", err);
    res.status(500).json({ error: "Failed to fetch charities" });
  }
});

/**
 * GET /charities/admin (Admin Only)
 * Returns all charities with full configuration and aggregated CharityLedger balances.
 */
router.get("/admin", validateToken, isAdmin, async (req, res) => {
  try {
    const charities = await db.Charity.findAll({
      include: [
        { model: db.Towns, attributes: ["id", "townName"] },
        {
          model: db.CharityLedger,
          attributes: ["id", "amount_pence", "status", "payout_batch_id", "paid_at"],
        },
      ],
      order: [["id", "ASC"]],
    });

    const formatted = charities.map((c) => {
      const ledgers = c.CharityLedgers || [];
      let estimatedPence = 0;
      let accruedPence = 0;
      let paidPence = 0;

      for (const entry of ledgers) {
        if (entry.status === "estimated") estimatedPence += entry.amount_pence;
        else if (entry.status === "accrued") accruedPence += entry.amount_pence;
        else if (entry.status === "paid") paidPence += entry.amount_pence;
      }

      const plain = c.toJSON();
      delete plain.CharityLedgers;
      return {
        ...plain,
        balances: {
          estimatedPence,
          accruedPence,
          unpaidTotalPence: estimatedPence + accruedPence,
          paidPence,
        },
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error("Error fetching admin charities:", err);
    res.status(500).json({ error: "Failed to load admin charities" });
  }
});

/**
 * GET /charities/ledger (Admin Only)
 * Returns recent CharityLedger rows with Order and Charity references.
 */
router.get("/ledger", validateToken, isAdmin, async (req, res) => {
  try {
    const entries = await db.CharityLedger.findAll({
      include: [
        { model: db.Charity, attributes: ["id", "name", "charity_reg_number"] },
        { model: db.Order, attributes: ["id", "order_number", "status", "createdAt"] },
      ],
      order: [["createdAt", "DESC"]],
      limit: 200,
    });
    res.json(entries);
  } catch (err) {
    console.error("Error fetching charity ledger:", err);
    res.status(500).json({ error: "Failed to fetch charity ledger" });
  }
});

/**
 * POST /charities (Admin Only)
 */
router.post("/", validateToken, isAdmin, async (req, res) => {
  const {
    name,
    charity_reg_number,
    logo_url,
    description,
    townId,
    payout_provider,
    external_payout_id,
    bank_sort_code,
    bank_account_number,
    is_active,
  } = req.body || {};

  if (typeof name !== "string" || !name.trim() || name.trim().length > 255) {
    return res.status(400).json({ error: "Charity name is required (1-255 chars)" });
  }

  const provider = VALID_PROVIDERS.includes(payout_provider)
    ? payout_provider
    : "manual_batch";

  try {
    const charity = await db.Charity.create({
      name: name.trim(),
      charity_reg_number: charity_reg_number ? String(charity_reg_number).trim() : null,
      logo_url: logo_url ? String(logo_url).trim() : null,
      description: description ? String(description).trim() : null,
      townId: townId ? Number(townId) : null,
      payout_provider: provider,
      external_payout_id: external_payout_id ? String(external_payout_id).trim() : null,
      bank_sort_code: bank_sort_code ? String(bank_sort_code).trim() : null,
      bank_account_number: bank_account_number ? String(bank_account_number).trim() : null,
      is_active: is_active === undefined ? true : Boolean(is_active),
    });

    res.status(201).json(charity);
  } catch (err) {
    console.error("Error creating charity:", err);
    res.status(500).json({ error: "Failed to create charity" });
  }
});

/**
 * PUT /charities/:id (Admin Only)
 */
router.put("/:id", validateToken, isAdmin, async (req, res) => {
  try {
    const charity = await db.Charity.findByPk(req.params.id);
    if (!charity) {
      return res.status(404).json({ error: "Charity not found" });
    }

    const {
      name,
      charity_reg_number,
      logo_url,
      description,
      townId,
      payout_provider,
      external_payout_id,
      bank_sort_code,
      bank_account_number,
      is_active,
    } = req.body || {};

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({ error: "Charity name must be non-empty" });
    }

    await charity.update({
      name: name !== undefined ? name.trim() : charity.name,
      charity_reg_number:
        charity_reg_number !== undefined
          ? charity_reg_number
            ? String(charity_reg_number).trim()
            : null
          : charity.charity_reg_number,
      logo_url:
        logo_url !== undefined
          ? logo_url
            ? String(logo_url).trim()
            : null
          : charity.logo_url,
      description:
        description !== undefined
          ? description
            ? String(description).trim()
            : null
          : charity.description,
      townId:
        townId !== undefined ? (townId ? Number(townId) : null) : charity.townId,
      payout_provider:
        payout_provider && VALID_PROVIDERS.includes(payout_provider)
          ? payout_provider
          : charity.payout_provider,
      external_payout_id:
        external_payout_id !== undefined
          ? external_payout_id
            ? String(external_payout_id).trim()
            : null
          : charity.external_payout_id,
      bank_sort_code:
        bank_sort_code !== undefined
          ? bank_sort_code
            ? String(bank_sort_code).trim()
            : null
          : charity.bank_sort_code,
      bank_account_number:
        bank_account_number !== undefined
          ? bank_account_number
            ? String(bank_account_number).trim()
            : null
          : charity.bank_account_number,
      is_active: is_active !== undefined ? Boolean(is_active) : charity.is_active,
    });

    res.json(charity);
  } catch (err) {
    console.error("Error updating charity:", err);
    res.status(500).json({ error: "Failed to update charity" });
  }
});

/**
 * POST /charities/payouts/settle (Admin Only)
 * Generates a Payout Batch CSV across unpaid ledger entries (defaulting to 'accrued',
 * or including 'estimated' when includeEstimated=true for sandbox testing),
 * runs optional external provider hooks, and marks those ledger entries 'paid' when markPaid=true.
 */
router.post("/payouts/settle", validateToken, isAdmin, async (req, res) => {
  const { includeEstimated = false, markPaid = false } = req.body || {};
  const targetStatuses = includeEstimated ? ["accrued", "estimated"] : ["accrued"];

  try {
    const unpaidEntries = await db.CharityLedger.findAll({
      where: { status: targetStatuses },
      include: [{ model: db.Charity }],
    });

    if (unpaidEntries.length === 0) {
      return res.status(400).json({
        error: includeEstimated
          ? "No unpaid accrued or estimated ledger entries found."
          : "No confirmed ('accrued') ledger entries ready for payout. Enable 'Include Estimated' if testing before Prodigi ship completion.",
      });
    }

    const grouped = new Map();
    for (const entry of unpaidEntries) {
      const c = entry.Charity;
      if (!c) continue;
      if (!grouped.has(c.id)) {
        grouped.set(c.id, {
          charityId: c.id,
          charityName: c.name,
          charityRegNumber: c.charity_reg_number,
          payoutProvider: c.payout_provider,
          externalPayoutId: c.external_payout_id,
          bankSortCode: c.bank_sort_code,
          bankAccountNumber: c.bank_account_number,
          entryCount: 0,
          totalPence: 0,
          entryIds: [],
        });
      }
      const bucket = grouped.get(c.id);
      bucket.entryCount += 1;
      bucket.totalPence += entry.amount_pence;
      bucket.entryIds.push(entry.id);
    }

    const summaries = Array.from(grouped.values()).filter((s) => s.totalPence > 0);
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const batchId = `BATCH-${dateStamp}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

    const csv = generatePayoutBatchCsv(batchId, summaries);
    let providerResults = [];

    if (markPaid) {
      providerResults = await triggerOptionalExternalPayouts(batchId, summaries);
      const allIds = summaries.flatMap((s) => s.entryIds);
      await db.CharityLedger.update(
        {
          status: "paid",
          payout_batch_id: batchId,
          paid_at: new Date(),
        },
        {
          where: { id: allIds },
        }
      );
    }

    res.json({
      batchId,
      markedPaid: Boolean(markPaid),
      charityCount: summaries.length,
      totalDisbursedPence: summaries.reduce((sum, s) => sum + s.totalPence, 0),
      csv,
      providerResults,
    });
  } catch (err) {
    console.error("Error processing charity payout batch:", err);
    res.status(500).json({ error: err.message || "Failed to generate payout batch" });
  }
});

module.exports = router;
