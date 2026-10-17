import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { config } from "../config.js";

export const MAX_IMAGES = 6;

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

const storage = multer.diskStorage({
  destination: config.uploadsDir,
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${EXT[file.mimetype]}`),
});

export const uploadImages = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: MAX_IMAGES },
  fileFilter: (_req, file, cb) => {
    if (EXT[file.mimetype]) cb(null, true);
    else cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "images"));
  },
}).array("images", MAX_IMAGES);

export const uploadMovieImage = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (EXT[file.mimetype]) cb(null, true);
    else cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "movieImage"));
  },
}).single("movieImage");

/** Remove stored upload files (ignores external URLs and missing files). */
export async function removeUploads(urls) {
  await Promise.all(
    urls
      .filter((u) => u.startsWith("/uploads/"))
      .map((u) => fs.unlink(path.join(config.uploadsDir, path.basename(u))).catch(() => {})),
  );
}
