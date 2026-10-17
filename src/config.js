import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dharshak_manch",
  sessionSecret: process.env.SESSION_SECRET || "dev-only-insecure-secret",
  /** Allowed browser origins for direct API calls: comma-separated, trailing slashes ignored */
  clientOrigins: (process.env.CLIENT_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean),
  isProd: process.env.NODE_ENV === "production",
  /**
   * The website and API are on different sites in production (vercel.app / onrender.com), so the session
   * cookie must be SameSite=None + Secure to be sent with cross-site requests. Locally both are localhost.
   */
  cookieSameSite: process.env.COOKIE_SAMESITE || (process.env.NODE_ENV === "production" ? "none" : "lax"),
  resDir: path.join(root, "res"),
};

if (config.isProd && config.sessionSecret === "dev-only-insecure-secret") {
  throw new Error("SESSION_SECRET must be set in production");
}
