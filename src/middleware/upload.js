import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { config } from "../config.js";

export const MAX_IMAGES = 6;

const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

const storage = multer.diskStorage({
  destination: config.resDir,
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

/** A movie's images: the movie image (portrait) and an optional wide banner. */
export const uploadMovieImages = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (EXT[file.mimetype]) cb(null, true);
    else cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
  },
}).fields([
  { name: "movieImage", maxCount: 1 },
  { name: "bannerImage", maxCount: 1 },
]);

/** Paths of the movie images in a multipart request, e.g. { movieImage: "/res/…", bannerImage: undefined } */
export function movieImagePaths(req) {
  const path = (field) => (req.files?.[field]?.[0] ? `/res/${req.files[field][0].filename}` : undefined);
  return { movieImage: path("movieImage"), bannerImage: path("bannerImage") };
}

/** Remove stored upload files (ignores external URLs and missing files). */
export async function removeStoredFiles(urls) {
  await Promise.all(
    urls
      .filter((u) => u.startsWith("/res/"))
      .map((u) => fs.unlink(path.join(config.resDir, path.basename(u))).catch(() => {})),
  );
}
