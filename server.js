require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const dbModule = require("./db");
const currency = require("./currency");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = dbModule.init();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || null;

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${req.method} ${req.path} ${JSON.stringify(req.query)} ${JSON.stringify(req.body)}`,
  );
  next();
});

app.use(express.static(path.join(__dirname, "public")));

function insertSubmission(payload, category, cb) {
  db.addSubmission(currency.normalizePayload(payload), category, cb);
}

function toArrayParam(v) {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    if (v.indexOf(",") !== -1)
      return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (v === "") return null;
    return [v];
  }
  return [String(v)];
}

function parseFiltersFromQuery(q) {
  const requestedReportingCurrency =
    typeof q.reportingCurrency === "string"
      ? q.reportingCurrency.toUpperCase()
      : currency.BASE_CURRENCY;
  const filters = {
    currentFuel: toArrayParam(q.currentFuel),
    interest: toArrayParam(q.interest),
    budget: toArrayParam(q.budget),
    category: toArrayParam(q.category),
    currency: toArrayParam(q.currency),
    reportingCurrency: currency.isSupportedCurrency(requestedReportingCurrency)
      ? requestedReportingCurrency
      : currency.BASE_CURRENCY,
    minMonthlySpend: q.minMonthlySpend ? parseFloat(q.minMonthlySpend) : null,
    maxMonthlySpend: q.maxMonthlySpend ? parseFloat(q.maxMonthlySpend) : null,
    analyzeBy: q.analyzeBy || null,
  };
  return filters;
}

function getAnalyticsPayload(payload) {
  if (payload && payload.currencyConversionStatus) return payload;
  return currency.normalizePayload(payload || {});
}

function amountInBase(payload) {
  const analyticsPayload = getAnalyticsPayload(payload);
  return Number.isFinite(analyticsPayload.monthlySpendBase)
    ? analyticsPayload.monthlySpendBase
    : null;
}

function matchFilters(record, filters) {
  if (!filters) return true;
  const p = record.payload || {};
  const analyticsPayload = getAnalyticsPayload(p);

  if (filters.currentFuel) {
    if (!p.currentFuel || !filters.currentFuel.includes(String(p.currentFuel)))
      return false;
  }
  if (filters.interest) {
    const val = p.interest;
    if (Array.isArray(val)) {
      if (!val.some((v) => filters.interest.includes(String(v)))) return false;
    } else {
      if (!val || !filters.interest.includes(String(val))) return false;
    }
  }
  if (filters.budget) {
    if (!p.budget || !filters.budget.includes(String(p.budget))) return false;
  }
  if (filters.category) {
    if (!record.category || !filters.category.includes(String(record.category)))
      return false;
  }
  if (filters.currency) {
    if (!p.currency || !filters.currency.includes(String(p.currency)))
      return false;
  }
  if (filters.minMonthlySpend != null || filters.maxMonthlySpend != null) {
    const ms = amountInBase(p);
    const minBase =
      filters.minMonthlySpend == null
        ? null
        : currency.convertAmount(
            filters.minMonthlySpend,
            filters.reportingCurrency,
          );
    const maxBase =
      filters.maxMonthlySpend == null
        ? null
        : currency.convertAmount(
            filters.maxMonthlySpend,
            filters.reportingCurrency,
          );
    if (Number.isNaN(ms)) return false;
    if (
      ms == null ||
      minBase == null ||
      (maxBase == null && filters.maxMonthlySpend != null)
    )
      return false;
    if (minBase != null && ms < minBase) return false;
    if (maxBase != null && ms > maxBase) return false;
  }

  return true;
}

function monthlySpendBucketLabel(
  ms,
  reportingCurrency = currency.BASE_CURRENCY,
) {
  const n = currency.convertFromBase(ms, reportingCurrency);
  if (isNaN(n)) return "unknown";
  if (n < 50) return `0-49 ${reportingCurrency}`;
  if (n < 100) return `50-99 ${reportingCurrency}`;
  if (n < 200) return `100-199 ${reportingCurrency}`;
  return `200+ ${reportingCurrency}`;
}

// Route descriptions for API discovery
const routeDescriptions = {
  "/webhook":
    "POST webhook endpoint for Formspree submissions. Includes optional webhook secret verification via headers or query params.",
  "/submit":
    "POST endpoint for direct frontend submissions. Stores data locally and returns success HTML page with submission ID.",
  "/api":
    "GET endpoint for API discovery. Lists all available routes with methods and descriptions.",
  "/api/submissions":
    "GET endpoint to list all submissions with pagination (?page=1&limit=50) and optional filtering by currentFuel, interest, budget, category, currency, reportingCurrency, minMonthlySpend, maxMonthlySpend.",
  "/api/aggregate":
    "GET endpoint to aggregate submissions by specified dimension (?analyzeBy=category|currentFuel|interest|budget|monthlySpendBucket|currency). Supports same filters as /api/submissions and returns the reporting currency.",
  "/api/stats":
    "GET endpoint for simple statistics. Returns counts grouped by category.",
};

// Webhook endpoint for Formspree to POST to
app.post("/webhook", (req, res) => {
  // Verify webhook secret (if configured)
  if (WEBHOOK_SECRET) {
    const provided =
      req.headers["x-webhook-secret"] ||
      req.query.secret ||
      req.headers["x-secret"] ||
      req.headers["secret"];
    if (!provided || provided !== WEBHOOK_SECRET) {
      console.warn("Rejected webhook: missing/invalid secret");
      return res.status(401).send("unauthorized");
    }
  }

  const body = req.body || {};
  const category =
    body.category ||
    body.interest ||
    (body.answers && body.answers.category) ||
    "uncategorized";
  insertSubmission(body, category, (err, id) => {
    if (err) {
      console.error("DB insert error", err);
      return res.status(500).send("error");
    }
    res.status(200).send({ status: "ok", id });
  });
});

// Direct frontend submit (optional)
app.post("/submit", (req, res) => {
  const body = req.body || {};
  const category = body.category || "uncategorized";
  insertSubmission(body, category, (err, id) => {
    if (err) return res.status(500).json({ error: "DB insert failed" });
    // res.json({ status: 'ok', id });
    // flash a success message
    // req.flash('success', 'Submission received. Thank you!');
    // Note: we send an html response here. The frontend can be designed to handle this response and show a success message or the new submission ID. This keeps the API flexible for different frontend implementations.
    res.send(`
      <html>
      <body>
        <h1>Submission Received</h1>
        <br />
        <p>Thank you for your submission. Your ID is ${id}.</p><br />
        <button onclick="window.location.href='/'">Back to Form</button>
        <button onclick="window.location.href='https://pamodzibes.com'">Back to Homepage</button>
      </body>
      </html>
      `);
  });
});

// JSON response showing all server routes including method and path, for debugging and API discovery with descriptions.
app.get("/api", (req, res) => {
  // include method and path for each route, and optionally a description if available
  const routes = [];
  app._router.stack.forEach((r) => {
    if (r.route && r.route.path) {
      routes.push({
        method: Object.keys(r.route.methods)[0].toUpperCase(),
        path: r.route.path,
        // include descriptions from a separate object
        description: routeDescriptions[r.route.path] || "",
      });
    }
  });
  res.json({ routes });
});

// List submissions
app.get("/api/submissions", (req, res) => {
  // Pagination: ?page=1&limit=50
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    2000,
    Math.max(1, parseInt(req.query.limit, 10) || 50),
  );
  const filters = parseFiltersFromQuery(req.query);

  db.getSubmissions((err, rows) => {
    if (err) return res.status(500).json({ error: "DB read failed" });
    const filtered = rows.filter((r) => matchFilters(r, filters));
    const total = filtered.length;
    const start = (page - 1) * limit;
    const paged = filtered.slice(start, start + limit);
    res.json({ total, page, limit, submissions: paged });
  });
});

// Aggregation endpoint: /api/aggregate?analyzeBy=category|currentFuel|interest|budget|monthlySpendBucket + filters
app.get("/api/aggregate", (req, res) => {
  const analyzeBy = req.query.analyzeBy || "category";
  const filters = parseFiltersFromQuery(req.query);

  db.getSubmissions((err, rows) => {
    if (err) return res.status(500).json({ error: "DB read failed" });
    const filtered = rows.filter((r) => matchFilters(r, filters));

    const counts = {};
    filtered.forEach((r) => {
      const p = r.payload || {};
      let key = "unknown";
      switch (analyzeBy) {
        case "currentFuel":
          key = p.currentFuel || "unknown";
          break;
        case "interest":
          if (Array.isArray(p.interest)) key = p.interest[0] || "unknown";
          else key = p.interest || "unknown";
          break;
        case "budget":
          key = p.budget || "unknown";
          break;
        case "monthlySpendBucket":
          key = monthlySpendBucketLabel(
            amountInBase(p),
            filters.reportingCurrency,
          );
          break;
        case "category":
        default:
          key = r.category || "uncategorized";
          break;
      }
      counts[key] = (counts[key] || 0) + 1;
    });

    res.json({
      analyzeBy,
      reportingCurrency: filters.reportingCurrency,
      baseCurrency: currency.BASE_CURRENCY,
      rateVersion: currency.RATE_VERSION,
      counts,
      total: filtered.length,
    });
  });
});

// Simple stats: counts by category
app.get("/api/stats", (req, res) => {
  db.getStats((err, counts) => {
    if (err) return res.status(500).json({ error: "DB read failed" });
    res.json(counts);
  });
});

const CLI_PORT = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const PORT = process.env.PORT || CLI_PORT;
const timestamp = new Date().toISOString();
const server = app.listen(PORT, () => {
  console.log(`[${timestamp}] Server started.`);
  console.log(`[${timestamp}] Listening on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Set environment variable PORT to an available port or stop the process using it.`,
    );
    process.exit(1);
  }
  console.error("Server error", err);
  process.exit(1);
});
