/**
 * Non-destructively seeds the default UK towns, 12 curated town charities,
 * and starter archival print products/variants (with real Prodigi v4 SKUs)
 * when tables are empty.
 */

const DEFAULT_TOWNS = [
  { townName: "Edinburgh", latitude: 55.9533, longitude: -3.1883 },
  { townName: "Manchester", latitude: 53.4808, longitude: -2.2426 },
  { townName: "Liverpool", latitude: 53.4084, longitude: -2.9916 },
  { townName: "Warrington", latitude: 53.39, longitude: -2.597 },
];

const DEFAULT_CHARITIES = [
  // Edinburgh (OSCR registered)
  {
    townName: "Edinburgh",
    name: "Edinburgh Children's Hospital",
    charity_reg_number: "SC020862",
    logo_url: "https://placehold.co/60x60/e11d48/ffffff?text=ECH",
    description:
      "Funds life-changing medical equipment, family support, and play therapy for sick children across Scotland.",
  },
  {
    townName: "Edinburgh",
    name: "Edinburgh Food Project",
    charity_reg_number: "SC043278",
    logo_url: "https://placehold.co/60x60/e11d48/ffffff?text=EFP",
    description:
      "Provides emergency food parcels alongside debt, benefits, and money advice to local people in crisis.",
  },
  {
    townName: "Edinburgh",
    name: "Streetwork",
    charity_reg_number: "SC003558",
    logo_url: "https://placehold.co/60x60/e11d48/ffffff?text=SW",
    description:
      "Delivers frontline outreach, safe shelter, and crisis support to people experiencing homelessness in Edinburgh.",
  },
  // Manchester (Charity Commission registered)
  {
    townName: "Manchester",
    name: "Wood Street Mission",
    charity_reg_number: "1078337",
    logo_url: "https://placehold.co/60x60/2563eb/ffffff?text=WSM",
    description:
      "Helps children and families affected by poverty in Manchester with everyday essentials, school uniforms, and books.",
  },
  {
    townName: "Manchester",
    name: "Manchester Central Foodbank",
    charity_reg_number: "1154355",
    logo_url: "https://placehold.co/60x60/2563eb/ffffff?text=MCF",
    description:
      "Supplies emergency nutritionally balanced food parcels and community support across central Manchester.",
  },
  {
    townName: "Manchester",
    name: "Mustard Tree",
    charity_reg_number: "1135192",
    logo_url: "https://placehold.co/60x60/2563eb/ffffff?text=MT",
    description:
      "Combats poverty and prevents homelessness across Greater Manchester through food clubs, training, and creative programmes.",
  },
  // Liverpool
  {
    townName: "Liverpool",
    name: "Kind Liverpool",
    charity_reg_number: "506276",
    logo_url: "https://placehold.co/60x60/16a34a/ffffff?text=KL",
    description:
      "Supports disadvantaged children and families across Merseyside with education, crisis hampers, and residential breaks.",
  },
  {
    townName: "Liverpool",
    name: "South Liverpool Foodbank",
    charity_reg_number: "1098407",
    logo_url: "https://placehold.co/60x60/16a34a/ffffff?text=SLF",
    description:
      "Provides emergency food supplies and compassionate practical support to local individuals and families facing hardship.",
  },
  {
    townName: "Liverpool",
    name: "The Whitechapel Centre",
    charity_reg_number: "1053957",
    logo_url: "https://placehold.co/60x60/16a34a/ffffff?text=TWC",
    description:
      "Works day and night to help people sleeping rough in Liverpool find safe accommodation, healthcare, and independence.",
  },
  // Warrington
  {
    townName: "Warrington",
    name: "Warrington Foodbank",
    charity_reg_number: "1154729",
    logo_url: "https://placehold.co/60x60/8b5cf6/ffffff?text=WF",
    description:
      "Offers emergency food parcels and essential household items to Warrington residents experiencing financial crisis.",
  },
  {
    townName: "Warrington",
    name: "Warrington Youth Zone",
    charity_reg_number: "1177600",
    logo_url: "https://placehold.co/60x60/8b5cf6/ffffff?text=WYZ",
    description:
      "Gives young people in Warrington a safe, inspiring space with sports, arts, mentoring, and hot meals.",
  },
  {
    townName: "Warrington",
    name: "St Rocco's Hospice",
    charity_reg_number: "512186",
    logo_url: "https://placehold.co/60x60/8b5cf6/ffffff?text=SRH",
    description:
      "Provides specialist palliative care and emotional support for patients with life-limiting illnesses and their families.",
  },
];

const DEFAULT_PRODUCTS = [
  {
    name: "Posters",
    description:
      "Museum-quality 250gsm matte archival paper with rich vintage pigment inks, ready to hang or frame.",
    variants: [
      {
        description: "A4 Enhanced Matte Art Poster (21 x 29.7cm)",
        price_pence: 1999,
        prodigi_sku: "GLOBAL-PAP-A4",
        estimated_cost_pence: 950,
      },
      {
        description: "A3 Enhanced Matte Art Poster (29.7 x 42cm)",
        price_pence: 2699,
        prodigi_sku: "GLOBAL-PAP-A3",
        estimated_cost_pence: 1190,
      },
      {
        description: "A2 Enhanced Matte Art Poster (42 x 59.4cm)",
        price_pence: 3499,
        prodigi_sku: "GLOBAL-PAP-A2",
        estimated_cost_pence: 1490,
      },
    ],
  },
  {
    name: "Framed Prints",
    description:
      "Hand-finished solid wood classic frames in black with shatter-resistant gallery glazing, ready to hang.",
    variants: [
      {
        description: "A4 Classic Black Framed Print",
        price_pence: 4499,
        prodigi_sku: "GLOBAL-CFPM-A4-BK",
        estimated_cost_pence: 2350,
      },
      {
        description: "A3 Classic Black Framed Print",
        price_pence: 5999,
        prodigi_sku: "GLOBAL-CFPM-A3-BK",
        estimated_cost_pence: 3150,
      },
    ],
  },
  {
    name: "Postcards",
    description:
      "Thick 350gsm textured fine art souvenir cards—ideal for gifting, collecting, or sending a piece of home.",
    variants: [
      {
        description: "A6 Souvenir Postcard (10.5 x 14.8cm)",
        price_pence: 499,
        prodigi_sku: "GLOBAL-FAP-A6",
        estimated_cost_pence: 260,
      },
    ],
  },
];

async function seedStoreDefaults(db) {
  try {
    // 1. Ensure baseline towns exist if empty
    const townCount = await db.Towns.count();
    if (townCount === 0) {
      await db.Towns.bulkCreate(DEFAULT_TOWNS);
    }

    const towns = await db.Towns.findAll();
    const townByName = new Map(
      towns.map((t) => [t.townName.toLowerCase(), t.id])
    );

    // 2. Seed the 12 curated UK/Scottish charities if none exist yet
    const charityCount = await db.Charity.count();
    if (charityCount === 0) {
      const charitiesPayload = DEFAULT_CHARITIES.map((c) => ({
        name: c.name,
        charity_reg_number: c.charity_reg_number,
        logo_url: c.logo_url,
        description: c.description,
        townId: townByName.get(c.townName.toLowerCase()) || null,
        payout_provider: "manual_batch",
        is_active: true,
      }));
      await db.Charity.bulkCreate(charitiesPayload);
      console.log(`Seeded ${charitiesPayload.length} default town charities.`);
    }

    // 3. Seed starter archival print formats & Prodigi SKU variants if empty
    const productCount = await db.Product.count();
    if (productCount === 0) {
      for (const prodDef of DEFAULT_PRODUCTS) {
        const createdProd = await db.Product.create({
          name: prodDef.name,
          description: prodDef.description,
        });
        await db.ProductVariant.bulkCreate(
          prodDef.variants.map((v) => ({
            ...v,
            productId: createdProd.id,
          }))
        );
      }
      console.log("Seeded starter Posters, Framed Prints, and Postcards with Prodigi SKUs.");
    }
  } catch (err) {
    console.warn("Warning while seeding store defaults:", err.message);
  }
}

async function ensureProductionColumns(db) {
  try {
    const qi = db.sequelize.getQueryInterface();
    const { DataTypes } = db.Sequelize;

    const variantCols = await qi.describeTable("ProductVariants");
    if (!variantCols.prodigi_sku) {
      await qi.addColumn("ProductVariants", "prodigi_sku", {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "GLOBAL-PAP-A4",
      });
      console.log("[Schema] Added missing column ProductVariants.prodigi_sku");
    }
    if (!variantCols.estimated_cost_pence) {
      await qi.addColumn("ProductVariants", "estimated_cost_pence", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
      console.log("[Schema] Added missing column ProductVariants.estimated_cost_pence");
    }
  } catch (err) {
    console.warn("[Schema] Warning checking ProductVariants columns:", err.message);
  }
}

module.exports = { seedStoreDefaults, ensureProductionColumns };
