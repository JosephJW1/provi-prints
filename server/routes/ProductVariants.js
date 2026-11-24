const express = require("express");
const router = express.Router();
const { ProductVariant, Product } = require("../models");
const { validateToken, isAdmin } = require("../middlewares/AuthMiddleware");

const MAX_BULK_VARIANTS = 50;

// Assign multiple variants to a Product at once (Admin Only)
router.post("/bulk", validateToken, isAdmin, async (req, res) => {
  const { ProductId, variants } = req.body;

  if (!ProductId || !Array.isArray(variants) || variants.length === 0) {
    return res
      .status(400)
      .json({ error: "ProductId and a non-empty array of variants are required" });
  }

  if (variants.length > MAX_BULK_VARIANTS) {
    return res
      .status(400)
      .json({ error: `Cannot create more than ${MAX_BULK_VARIANTS} variants at once` });
  }

  try {
    const product = await Product.findByPk(ProductId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Explicitly whitelist and validate fields to prevent mass assignment
    const sanitizedVariants = [];
    for (const variant of variants) {
      const rawDesc = variant?.description ?? variant?.name;
      const rawPrice = variant?.price_pence ?? variant?.price;
      const rawSku = variant?.prodigi_sku;
      const rawEstCost = variant?.estimated_cost_pence ?? 0;

      const description = typeof rawDesc === "string" ? rawDesc.trim() : "";
      const price_pence = Number(rawPrice);
      const prodigi_sku =
        typeof rawSku === "string" && rawSku.trim()
          ? rawSku.trim()
          : "GLOBAL-PAP-A4";
      const estimated_cost_pence = Number(rawEstCost);

      if (!description || description.length > 255) {
        return res.status(400).json({
          error: "Each variant must have a valid description (1-255 characters)",
        });
      }

      if (!Number.isInteger(price_pence) || price_pence < 0) {
        return res.status(400).json({
          error: "Each variant must have a non-negative integer price_pence",
        });
      }

      if (!Number.isInteger(estimated_cost_pence) || estimated_cost_pence < 0) {
        return res.status(400).json({
          error: "estimated_cost_pence must be a non-negative integer",
        });
      }

      sanitizedVariants.push({
        description,
        price_pence,
        prodigi_sku,
        estimated_cost_pence,
        productId: product.id,
      });
    }

    const createdVariants = await ProductVariant.bulkCreate(sanitizedVariants);
    res
      .status(201)
      .json({ message: "Variants added successfully", variants: createdVariants });
  } catch (error) {
    console.error("Error creating variants:", error);
    res.status(500).json({ error: "Failed to create variants" });
  }
});

// Edit a single variant (Admin Only)
router.put("/:id", validateToken, isAdmin, async (req, res) => {
  const variantId = req.params.id;
  const rawDesc = req.body.description ?? req.body.name;
  const rawPrice = req.body.price_pence ?? req.body.price;
  const rawSku = req.body.prodigi_sku;
  const rawEstCost = req.body.estimated_cost_pence;

  try {
    const variant = await ProductVariant.findByPk(variantId);
    if (!variant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    const updatedFields = {};

    if (rawDesc !== undefined) {
      if (typeof rawDesc !== "string" || !rawDesc.trim() || rawDesc.trim().length > 255) {
        return res.status(400).json({
          error: "Variant description must be a non-empty string up to 255 characters",
        });
      }
      updatedFields.description = rawDesc.trim();
    }

    if (rawPrice !== undefined) {
      const price_pence = Number(rawPrice);
      if (!Number.isInteger(price_pence) || price_pence < 0) {
        return res
          .status(400)
          .json({ error: "Variant price_pence must be a non-negative integer" });
      }
      updatedFields.price_pence = price_pence;
    }

    if (rawSku !== undefined) {
      if (typeof rawSku !== "string" || !rawSku.trim() || rawSku.trim().length > 120) {
        return res.status(400).json({
          error: "prodigi_sku must be a non-empty string up to 120 characters",
        });
      }
      updatedFields.prodigi_sku = rawSku.trim();
    }

    if (rawEstCost !== undefined) {
      const estimated_cost_pence = Number(rawEstCost);
      if (!Number.isInteger(estimated_cost_pence) || estimated_cost_pence < 0) {
        return res.status(400).json({
          error: "estimated_cost_pence must be a non-negative integer",
        });
      }
      updatedFields.estimated_cost_pence = estimated_cost_pence;
    }

    await variant.update(updatedFields);
    res.json({ message: "Variant updated successfully", variant });
  } catch (error) {
    console.error("Error updating variant:", error);
    res.status(500).json({ error: "Failed to update variant" });
  }
});

// Delete a single variant (Admin Only)
router.delete("/:id", validateToken, isAdmin, async (req, res) => {
  const variantId = req.params.id;

  try {
    const variant = await ProductVariant.findByPk(variantId);
    if (!variant) {
      return res.status(404).json({ error: "Variant not found" });
    }

    await variant.destroy();
    res.json({ message: "Variant deleted successfully" });
  } catch (error) {
    console.error("Error deleting variant:", error);
    res.status(500).json({ error: "Failed to delete variant" });
  }
});

module.exports = router;
