import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dharshak_manch",
  sessionSecret: process.env.SESSION_SECRET || "dev-only-insecure-secret",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  isProd: process.env.NODE_ENV === "production",
  uploadsDir: path.join(root, "uploads"),
};

if (config.isProd && config.sessionSecret === "dev-only-insecure-secret") {
  throw new Error("SESSION_SECRET must be set in production");
}
