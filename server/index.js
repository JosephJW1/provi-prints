require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const db = require("./models");
const { seedStoreDefaults } = require("./utils/seedCharities");

const app = express();

// Trust first reverse proxy hop (Google Cloud Run / Cloudflare) so rate limiters and secure cookies see real client IPs/HTTPS
app.set("trust proxy", 1);

// Hide Express server signature and apply standard security headers
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Mount Stripe & Prodigi Webhooks BEFORE express.json({ limit: "10kb" })
// so /webhooks/stripe receives the raw Buffer for signature verification and larger event payloads succeed.
const webhooksRouter = require("./routes/Webhooks");
app.use("/webhooks", webhooksRouter);

// Limit JSON body size on standard API routes to mitigate large-payload DoS attacks
app.use(express.json({ limit: "25kb" }));

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : ["http://localhost:5173", "http://localhost:5174"];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Portal"],
  })
);
app.use(cookieParser());

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again later." },
});

// Strict rate limiter for authentication endpoints (login & register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again in 15 minutes." },
});

app.use(apiLimiter);
app.use("/auth/login", authLimiter);
app.use("/auth/register", authLimiter);

// Routers
const authRouter = require("./routes/Auth");
app.use("/auth", authRouter);

const productsRouter = require("./routes/Products");
app.use("/products", productsRouter);

const variantsRouter = require("./routes/ProductVariants");
app.use("/variants", variantsRouter);

const townRouter = require("./routes/Towns");
app.use("/towns", townRouter);

const designsRouter = require("./routes/Designs");
app.use("/designs", designsRouter);

const charitiesRouter = require("./routes/Charities");
app.use("/charities", charitiesRouter);

const checkoutRouter = require("./routes/Checkout");
app.use("/checkout", checkoutRouter);

const ordersRouter = require("./routes/Orders");
app.use("/orders", ordersRouter);

// Health check to verify active server build
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Structured JSON 404 handler (prevents Express default HTML 404 CSP header)
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

// Global error handler (catches malformed JSON body errors, Multer upload errors, and unexpected exceptions)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ error: "Malformed JSON payload" });
  }
  if (err && err.name === "MulterError") {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err && err.message && err.message.startsWith("Invalid file type")) {
    return res.status(400).json({ error: err.message });
  }
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = Number(process.env.PORT) || 3001;

db.sequelize
  .sync()
  .then(async () => {
    if (process.env.NODE_ENV !== "production") {
      if (db.Design) await db.Design.sync({ alter: true });
      if (db.ProductVariant) await db.ProductVariant.sync({ alter: true });
    }
    await seedStoreDefaults(db);

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Graceful shutdown for Google Cloud Run container scale-down (SIGTERM)
    const shutdown = (signal) => {
      console.log(`Received ${signal}. Closing HTTP server and DB pool...`);
      server.close(async () => {
        try {
          await db.sequelize.close();
          process.exit(0);
        } catch (err) {
          console.error("Error closing database connection:", err);
          process.exit(1);
        }
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error("Failed to sync database:", err);
    process.exit(1);
  });
