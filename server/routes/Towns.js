const express = require("express");
const router = express.Router();
const { Towns, Design, Charity } = require("../models");

router.get("/", async (req, res) => {
  try {
    const includes = [
      {
        model: Design,
        attributes: ["id", "title", "description", "image_url", "createdAt", "updatedAt"],
        through: { attributes: [] },
      },
    ];

    if (Charity) {
      includes.push({
        model: Charity,
        where: { is_active: true },
        required: false,
        attributes: ["id", "name", "charity_reg_number", "logo_url", "description", "townId"],
      });
    }

    const listOfTowns = await Towns.findAll({
      include: includes,
    });
    res.json(listOfTowns);
  } catch (error) {
    console.error("Error fetching towns:", error);
    res.status(500).json({ error: "Failed to fetch towns" });
  }
});

module.exports = router;
