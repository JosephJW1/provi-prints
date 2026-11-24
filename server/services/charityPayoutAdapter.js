/**
 * Pluggable Charity Payout Adapter
 * Supports:
 * 1. Standardized CSV batch export for UK Faster Payments (Wise Batch, Revolut Bulk, Work for Good)
 * 2. Extensible API disbursement hook ready for Goodstack API or Wise Business API
 */

function escapeCsvField(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates a CSV formatted for UK Charity Batch Disbursements / Wise / Work for Good reporting.
 *
 * @param {string} batchId
 * @param {Array<{
 *   charityId: number,
 *   charityName: string,
 *   charityRegNumber: string | null,
 *   payoutProvider: string,
 *   externalPayoutId: string | null,
 *   bankSortCode: string | null,
 *   bankAccountNumber: string | null,
 *   entryCount: number,
 *   totalPence: number
 * }>} charitySummaries
 * @returns {string}
 */
function generatePayoutBatchCsv(batchId, charitySummaries) {
  const headers = [
    "BatchReference",
    "CharityID",
    "CharityName",
    "UKCharityRegNumber",
    "PayoutProvider",
    "ExternalPayoutID",
    "RecipientSortCode",
    "RecipientAccountNumber",
    "Currency",
    "AmountGBP",
    "AmountPence",
    "LedgerItemsCount",
    "PaymentReference",
  ];

  const lines = [headers.join(",")];

  for (const row of charitySummaries) {
    const amountGbp = (row.totalPence / 100).toFixed(2);
    const paymentRef = `PROVI-${batchId.slice(-8)}-${row.charityId}`;
    lines.push(
      [
        batchId,
        row.charityId,
        row.charityName,
        row.charityRegNumber || "",
        row.payoutProvider || "manual_batch",
        row.externalPayoutId || "",
        row.bankSortCode || "",
        row.bankAccountNumber || "",
        "GBP",
        amountGbp,
        row.totalPence,
        row.entryCount,
        paymentRef,
      ]
        .map(escapeCsvField)
        .join(",")
    );
  }

  return lines.join("\n");
}

/**
 * Optional external API execution hook.
 * If GOODSTACK_API_KEY is configured and a charity uses payout_provider === 'goodstack',
 * calls Goodstack's donation endpoint; otherwise prepares batch summary for manual/CSV settlement.
 */
async function triggerOptionalExternalPayouts(batchId, charitySummaries) {
  const results = [];
  const goodstackKey = (process.env.GOODSTACK_API_KEY || "").trim();
  const goodstackUrl = (
    process.env.GOODSTACK_API_URL || "https://api.sandbox.goodstack.io/v1"
  ).replace(/\/+$/, "");

  for (const summary of charitySummaries) {
    if (
      summary.payoutProvider === "goodstack" &&
      goodstackKey &&
      summary.externalPayoutId
    ) {
      const resp = await fetch(`${goodstackUrl}/donations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${goodstackKey}`,
          "Idempotency-Key": `${batchId}-charity-${summary.charityId}`,
        },
        body: JSON.stringify({
          nonprofitId: summary.externalPayoutId,
          amount: summary.totalPence,
          currency: "GBP",
          metadata: {
            batchId,
            charityName: summary.charityName,
            source: "Provi-Prints Automated Profit Share",
          },
        }),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        throw new Error(
          `Goodstack payout failed for ${summary.charityName} (${resp.status}): ${errBody}`
        );
      }
      results.push({
        charityId: summary.charityId,
        mode: "goodstack_api",
        status: "submitted",
      });
    } else {
      results.push({
        charityId: summary.charityId,
        mode: summary.payoutProvider || "manual_batch",
        status: "ready_for_csv_settlement",
      });
    }
  }

  return results;
}

module.exports = {
  generatePayoutBatchCsv,
  triggerOptionalExternalPayouts,
};
