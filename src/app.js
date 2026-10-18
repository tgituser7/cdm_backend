import MongoStore from "connect-mongo";
import cors from "cors";
import express from "express";
import session from "express-session";
import mongoose from "mongoose";
import multer from "multer";
import { config } from "./config.js";
import { loadUser } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import movieRoutes from "./routes/movies.js";
import feedRoutes from "./routes/feeds.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  // The website calls the API directly from another origin, with credentials (cookies).
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));

  // Browsers that block cross-site cookies (Safari/iOS, private windows) send the same signed session
  // id in an Authorization header instead; treat it exactly like the session cookie.
  app.use((req, _res, next) => {
    const auth = req.headers.authorization;
    const hasCookie = /(?:^|;\s*)cdm\.sid=/.test(req.headers.cookie ?? "");
    if (!hasCookie && auth?.startsWith("Bearer ")) {
      const token = auth.slice(7).trim();
      if (token) req.headers.cookie = [req.headers.cookie, `cdm.sid=${encodeURIComponent(token)}`].filter(Boolean).join("; ");
    }
    next();
  });

  // Cookie-based sessions; session data lives in MongoDB's "sessions" collection.
  app.use(
    session({
      name: "cdm.sid",
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: MongoStore.create({
        client: mongoose.connection.getClient(),
        collectionName: "sessions",
        ttl: 30 * 24 * 60 * 60,
        autoRemove: "native",
      }),
      cookie: {
        httpOnly: true,
        sameSite: config.cookieSameSite,
        secure: config.isProd || config.cookieSameSite === "none",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(loadUser);

  app.use("/res", express.static(config.resDir, { maxAge: "7d", immutable: true }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  // Called by the service itself (see keepAlive.js) so a free Render instance doesn't go to sleep.
  app.get("/api/keep-alive", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, uptimeSeconds: Math.round(process.uptime()) });
  });
  app.use("/api/auth", authRoutes);
  app.use("/api/feeds", feedRoutes);
  app.use("/api/movies", movieRoutes);

  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  // eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: "Each image must be 8 MB or smaller",
        LIMIT_FILE_COUNT: "You can add up to 6 images",
        LIMIT_UNEXPECTED_FILE: "Only JPG, PNG, WebP or GIF images are allowed",
      };
      return res.status(400).json({ error: messages[err.code] ?? err.message });
    }
    if (err instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ error: Object.values(err.errors)[0]?.message ?? "Invalid data" });
    }
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}
