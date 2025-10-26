import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import Dorm from "./models/Dorm.js";
import PointOfInterest from "./models/PointOfInterest.js";

const isProduction = process.env.NODE_ENV === "production";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
];

const parseOrigins = (value) =>
  String(value || "")
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

const envOrigins = [
  ...parseOrigins(process.env.ALLOWED_ORIGINS),
  ...parseOrigins(process.env.CORS_ORIGINS),
];

const allowAllOrigins = envOrigins.includes("*");
const allowedOrigins = allowAllOrigins
  ? ["*"]
  : Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins]));

const corsOptions = allowAllOrigins
  ? {
      origin: true,
      credentials: true,
    }
  : {
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        console.warn(`[cors] blocked origin: ${origin}`);
        return callback(null, false);
      },
      credentials: true,
    };

if (allowAllOrigins) {
  console.warn(
    "[cors] ALLOWED_ORIGINS includes '*'; every origin will be accepted."
  );
} else if (allowedOrigins.length > 0) {
  console.log(`[cors] allowed origins: ${allowedOrigins.join(", ")}`);
} else {
  console.warn("[cors] no allowed origins configured; only same-origin requests will work.");
}

const POI_CATEGORIES = [
  "seven",
  "pharmacy",
  "food",
  "laundry",
  "bar",
  "bike",
  "barber",
  "printer",
  "atm",
];

const normalizeCategoryFilter = (value) => {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  const cleaned = raw
    .flatMap((item) =>
      String(item)
        .split(",")
        .map((token) => token.trim().toLowerCase())
    )
    .filter(Boolean);
  if (cleaned.length === 0) return [];
  const unique = Array.from(new Set(cleaned));
  return unique.filter((token) => POI_CATEGORIES.includes(token));
};

const app = express();
app.set("trust proxy", 1);
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

// --- health ---
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Optional: lightweight DB info to help verify which database is in use
app.get("/api/health/db", async (_req, res, next) => {
  try {
    const name = mongoose.connection?.name || null;
    let collections = [];
    if (mongoose.connection?.db) {
      const cursor = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
      collections = cursor.map((c) => c.name).sort();
    }
    res.json({ ok: true, dbName: name, collections });
  } catch (e) {
    next(e);
  }
});

const DEFAULT_DB_URI = "mongodb://127.0.0.1:27017/dorm-finder";
const databaseUri =
  process.env.MONGODB_URI || process.env.MONGO_URI || DEFAULT_DB_URI;

if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
  console.warn(
    `[mongo] using fallback local connection string (${DEFAULT_DB_URI}).`
  );
}

mongoose.connection.on("connected", async () => {
  try {
    const name = mongoose.connection.name;
    console.log(`[mongo] connected (db: ${name})`);
  } catch {
    console.log("[mongo] connected");
  }
});
mongoose.connection.on("error", (error) =>
  console.error("[mongo] connection error:", error)
);
mongoose.connection.on("disconnected", () =>
  console.warn("[mongo] disconnected")
);

(async () => {
  try {
    await mongoose.connect(databaseUri, {
      autoIndex: !isProduction,
      serverSelectionTimeoutMS: Number(process.env.MONGODB_TIMEOUT_MS) || 5000,
      ...(process.env.MONGODB_DBNAME
        ? { dbName: process.env.MONGODB_DBNAME }
        : {}),
    });
  } catch (error) {
    console.error("[mongo] initial connection failed:", error.message);
    if (isProduction) {
      process.exit(1);
    }
  }
})();

const port = Number.parseInt(process.env.PORT, 10) || 4000;
const host = process.env.HOST || "0.0.0.0";
const server = app.listen(port, host, () => {
  console.log(`[boot] API listening on ${host}:${port}`);
});

let isShuttingDown = false;
const shutdown = async (reason) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[shutdown] received ${reason}. closing HTTP server.`);
  await new Promise((resolve) => {
    server.close((err) => {
      if (err) {
        console.error("[shutdown] error closing HTTP server:", err);
      }
      resolve();
    });
  });
  try {
    await mongoose.connection.close(false);
    console.log("[shutdown] MongoDB connection closed.");
  } catch (err) {
    console.error("[shutdown] error closing MongoDB connection:", err);
  } finally {
    process.exit(0);
  }
};

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => {
    shutdown(signal).catch((err) => {
      console.error("[shutdown] unexpected error:", err);
      process.exit(1);
    });
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandled rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[process] uncaught exception:", error);
  shutdown("uncaughtException").catch((err) => {
    console.error("[shutdown] error after uncaught exception:", err);
    process.exit(1);
  });
});

// --- endpoints ---
// List (MVP). Later: add q/types/bounds filters.
app.get("/api/dorms", async (req, res, next) => {
  try {
    const { q, north, south, east, west } = req.query;

    const filter = {};

    // Text filter by name (case-insensitive)
    if (q && String(q).trim()) {
      filter.name = { $regex: String(q).trim(), $options: "i" };
    }

    // Bounds filter when all are provided and numeric
    const n = Number(north);
    const s = Number(south);
    const e = Number(east);
    const w = Number(west);
    if ([n, s, e, w].every((v) => Number.isFinite(v))) {
      // Use a Polygon for 2dsphere index
      filter.location = {
        $geoWithin: {
          $geometry: {
            type: "Polygon",
            coordinates: [
              [
                [w, s],
                [e, s],
                [e, n],
                [w, n],
                [w, s],
              ],
            ],
          },
        },
      };
    }

    const docs = await Dorm.find(filter).limit(1000);
    res.json(docs);
  } catch (e) {
    next(e);
  }
});

// Get one
app.get("/api/dorms/:id", async (req, res, next) => {
  try {
    const doc = await Dorm.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// Create
app.post("/api/dorms", async (req, res, next) => {
  try {
    const doc = await Dorm.create(req.body);
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
});

// Update (partial)
app.put("/api/dorms/:id", async (req, res, next) => {
  try {
    const doc = await Dorm.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// Delete
app.delete("/api/dorms/:id", async (req, res, next) => {
  try {
    const doc = await Dorm.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// --- POIs ---
// List POIs with optional text/category + bounds filter
app.get("/api/pois", async (req, res, next) => {
  try {
    const { q, category, north, south, east, west } = req.query;

    const filter = {};

    if (q && String(q).trim()) {
      filter.name = { $regex: String(q).trim(), $options: "i" };
    }
    const categories = normalizeCategoryFilter(category);
    if (categories.length) {
      filter.category = { $in: categories };
    }

    const n = Number(north);
    const s = Number(south);
    const e = Number(east);
    const w = Number(west);
    if ([n, s, e, w].every((v) => Number.isFinite(v))) {
      filter.location = {
        $geoWithin: {
          $geometry: {
            type: "Polygon",
            coordinates: [
              [
                [w, s],
                [e, s],
                [e, n],
                [w, n],
                [w, s],
              ],
            ],
          },
        },
      };
    }

    const docs = await PointOfInterest.find(filter).limit(1000);
    res.json(docs);
  } catch (e) {
    next(e);
  }
});

// Get one POI
app.get("/api/pois/:id", async (req, res, next) => {
  try {
    const doc = await PointOfInterest.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// Create POI
app.post("/api/pois", async (req, res, next) => {
  try {
    const doc = await PointOfInterest.create(req.body);
    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
});

// Update POI (partial)
app.put("/api/pois/:id", async (req, res, next) => {
  try {
    const doc = await PointOfInterest.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    next(e);
  }
});

// Delete POI
app.delete("/api/pois/:id", async (req, res, next) => {
  try {
    const doc = await PointOfInterest.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// --- central error handler (JSON everywhere) ---
app.use((err, req, res, _next) => {
  // Bad ObjectId like /api/dorms/abc
  if (err?.name === "CastError") {
    return res.status(400).json({ error: "Invalid ID format" });
  }
  // Validation errors
  if (err?.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Server error" });
});


// --- serve frontend build (Vite) ---
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.NODE_ENV === "production") {
  const candidateRoots = [
    process.env.CLIENT_DIST && path.resolve(process.env.CLIENT_DIST),
    path.join(__dirname, "../client/dist"), // monorepo default
    path.join(__dirname, "client-dist"), // allow bundling dist inside server/
    path.join(__dirname, "public"), // generic public dir
  ].filter(Boolean);

  let clientDist = null;
  for (const p of candidateRoots) {
    try {
      if (fs.existsSync(path.join(p, "index.html"))) {
        clientDist = p;
        break;
      }
    } catch (_e) {
      // ignore
    }
  }

  const clientUrl = process.env.CLIENT_URL && String(process.env.CLIENT_URL).trim();

  if (clientDist) {
    console.log(`[static] serving client from: ${clientDist}`);
    app.use(express.static(clientDist));

    const sendIndex = (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    };

    // Ensure root works even if regex ever fails to match
    app.get("/", sendIndex);
    // Express 5: use RegExp catch-all for non-API routes
    app.get(/^(?!\/api).*/, sendIndex);
    // As a last safety net, handle any other method (e.g., HEAD)
    app.use((req, res, next) => {
      if (req.path && req.path.startsWith("/api")) return next();
      return sendIndex(req, res);
    });
  } else if (clientUrl) {
    console.log(`[static] no local build. Redirecting to CLIENT_URL: ${clientUrl}`);

    const redirectToClient = (req, res) => {
      try {
        const target = new URL(req.originalUrl || '/', clientUrl);
        res.redirect(302, target.toString());
      } catch (_e) {
        res.redirect(302, clientUrl);
      }
    };

    app.get("/", redirectToClient);
    app.get(/^(?!\/api).*/, redirectToClient);
    app.use((req, res, next) => {
      if (req.path && req.path.startsWith("/api")) return next();
      return redirectToClient(req, res);
    });
  } else {
    console.warn(
      "[static] client build not found. Set CLIENT_DIST or deploy client/dist next to the server."
    );
    const placeholder = (_req, res) => {
      res.status(200).send(
        "<html><head><meta charset='utf-8'><title>Dorm Finder</title></head><body>" +
          "<h2>API is running</h2>" +
          "<p>No front-end build found. Deploy client/dist or set CLIENT_DIST." +
          (clientUrl ? " Currently configured CLIENT_URL is: " + clientUrl : "") +
          "</p>" +
          "<p><a href='/api/health'>/api/health</a></p>" +
        "</body></html>"
      );
    };
    app.get("/", placeholder);
    app.get(/^(?!\/api).*/, placeholder);
    // Safety net for any other methods (e.g., HEAD)
    app.use((req, res, next) => {
      if (req.path && req.path.startsWith("/api")) return next();
      return placeholder(req, res);
    });
  }
}
