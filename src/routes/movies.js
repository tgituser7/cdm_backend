import { Router } from "express";
import mongoose from "mongoose";
import { requireRole } from "../middleware/auth.js";
import { removeUploads, uploadMovieImage } from "../middleware/upload.js";
import { CERTIFICATIONS, Movie, RATING_REQUEST_COOLDOWN_MS, STATUSES } from "../models/Movie.js";
import { Feed } from "../models/Feed.js";
import { movieAverage, serializeMovie } from "../utils/serialize.js";

const router = Router();

async function findMovie(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: "Movie not found" });
    return null;
  }
  const movie = await Movie.findById(req.params.id);
  if (!movie) res.status(404).json({ error: "Movie not found" });
  return movie;
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

function parseList(v, maxItems, maxLen) {
  if (v === undefined) return undefined;
  let arr = v;
  if (typeof v === "string") {
    try {
      arr = JSON.parse(v);
    } catch {
      arr = v.split(",");
    }
  }
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((s) => String(s).trim().slice(0, maxLen)).filter(Boolean))].slice(0, maxItems);
}

function parseJSON(v, fallback) {
  if (v === undefined) return undefined;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

/** Read movie fields from a (multipart) body. Only fields present in the body are returned. */
function readMovieFields(body) {
  const errors = [];
  const out = {};

  if (body.title !== undefined) {
    out.title = str(body.title, 120);
    if (!out.title) errors.push("Title is required");
  }
  for (const [k, max] of [["tagline", 160], ["synopsis", 4000], ["trailerUrl", 300]]) {
    if (body[k] !== undefined) out[k] = str(body[k], max) || undefined;
  }
  if (out.trailerUrl && !/^https?:\/\//i.test(out.trailerUrl)) errors.push("Trailer link must start with http:// or https://");

  const genres = parseList(body.genres, 6, 40);
  if (genres) out.genres = genres;
  const languages = parseList(body.languages, 6, 40);
  if (languages) out.languages = languages;

  if (body.releaseDate !== undefined) {
    if (body.releaseDate === "") out.releaseDate = undefined;
    else {
      const d = new Date(body.releaseDate);
      if (Number.isNaN(d.getTime())) errors.push("Invalid release date");
      else out.releaseDate = d;
    }
  }
  if (body.runtimeMinutes !== undefined) {
    if (body.runtimeMinutes === "") out.runtimeMinutes = undefined;
    else {
      const n = Number(body.runtimeMinutes);
      if (!Number.isInteger(n) || n < 1 || n > 600) errors.push("Runtime must be between 1 and 600 minutes");
      else out.runtimeMinutes = n;
    }
  }
  if (body.certification !== undefined) {
    if (body.certification === "") out.certification = undefined;
    else if (!CERTIFICATIONS.includes(body.certification)) errors.push("Invalid certification");
    else out.certification = body.certification;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) errors.push("Invalid status");
    else out.status = body.status;
  }

  const cast = parseJSON(body.cast, []);
  if (cast !== undefined) {
    out.cast = (Array.isArray(cast) ? cast : [])
      .map((c) => ({ name: str(c?.name, 80), role: str(c?.role, 80) || undefined }))
      .filter((c) => c.name)
      .slice(0, 30);
  }
  const team = parseJSON(body.team, []);
  if (team !== undefined) {
    out.team = (Array.isArray(team) ? team : [])
      .map((t) => ({ role: str(t?.role, 60), name: str(t?.name, 80) }))
      .filter((t) => t.role || t.name)
      .slice(0, 30);
    if (out.team.some((t) => !t.role || !t.name)) errors.push("Each team member needs both a role and a name");
  }
  return { out, errors };
}

/** GET /api/movies?director=<id>|me&sort=top|latest&rated=1&limit=n */
router.get("/", async (req, res) => {
  const { director, sort = "latest", rated, limit } = req.query;
  const query = {};
  if (director === "me") {
    if (!req.user) return res.json({ movies: [] });
    query.director = req.user._id;
  } else if (director && mongoose.isValidObjectId(director)) {
    query.director = director;
  }
  if (rated) query["ratings.0"] = { $exists: true };

  let movies = await Movie.find(query).sort({ createdAt: -1 }).limit(200);
  if (sort === "top") {
    movies = movies.sort((a, b) => (movieAverage(b) ?? 0) - (movieAverage(a) ?? 0) || b.ratings.length - a.ratings.length);
  }
  const n = Math.min(Number(limit) || 200, 200);
  res.json({ movies: movies.slice(0, n).map((m) => serializeMovie(m, req.user)) });
});

router.get("/:id", async (req, res) => {
  const movie = await findMovie(req, res);
  if (movie) res.json({ movie: serializeMovie(movie, req.user) });
});

router.post("/", requireRole("director"), uploadMovieImage, async (req, res) => {
  const movieImage = req.file ? `/uploads/${req.file.filename}` : undefined;
  const { out, errors } = readMovieFields({ ...req.body, title: req.body.title ?? "" });
  if (errors.length) {
    await removeUploads(movieImage ? [movieImage] : []);
    return res.status(400).json({ error: errors[0] });
  }
  const movie = await Movie.create({ ...out, movieImage, director: req.user._id, directorName: req.user.name });
  res.status(201).json({ movie: serializeMovie(movie, req.user) });
});

router.patch("/:id", requireRole("director"), uploadMovieImage, async (req, res) => {
  const newMovieImage = req.file ? `/uploads/${req.file.filename}` : undefined;
  const fail = async (status, error) => {
    await removeUploads(newMovieImage ? [newMovieImage] : []);
    return res.status(status).json({ error });
  };

  const movie = await findMovie(req, res);
  if (!movie) return removeUploads(newMovieImage ? [newMovieImage] : []);
  if (!movie.director.equals(req.user._id)) return fail(403, "You can only edit your own movies");

  const { out, errors } = readMovieFields(req.body);
  if (errors.length) return fail(400, errors[0]);

  const oldMovieImage = movie.movieImage;
  movie.set(out);
  if (newMovieImage) movie.movieImage = newMovieImage;
  else if (req.body.removeMovieImage === "true") movie.movieImage = undefined;
  await movie.save();
  if (oldMovieImage && oldMovieImage !== movie.movieImage) await removeUploads([oldMovieImage]);

  // Keep the rating feed's film tag in sync with the title.
  if (movie.ratingFeed && out.title) await Feed.updateOne({ _id: movie.ratingFeed }, { filmTitle: movie.title });
  res.json({ movie: serializeMovie(movie, req.user) });
});

router.delete("/:id", requireRole("director"), async (req, res) => {
  const movie = await findMovie(req, res);
  if (!movie) return;
  if (!movie.director.equals(req.user._id)) return res.status(403).json({ error: "You can only delete your own movies" });
  await Feed.deleteMany({ movie: movie._id, type: "rating" });
  await movie.deleteOne();
  if (movie.movieImage) await removeUploads([movie.movieImage]);
  res.json({ ok: true });
});

function formatWait(ms) {
  const mins = Math.ceil(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/**
 * POST /api/movies/:id/ask-rating { message } — share a (new) rating feed for this movie.
 * Allowed once every 24 hours per movie. Earlier ratings and reviews carry over to the new feed.
 */
router.post("/:id/ask-rating", requireRole("director"), async (req, res) => {
  const movie = await findMovie(req, res);
  if (!movie) return;
  if (!movie.director.equals(req.user._id)) return res.status(403).json({ error: "You can only ask for ratings on your own movies" });
  const waitMs = movie.ratingRequestedAt ? movie.ratingRequestedAt.getTime() + RATING_REQUEST_COOLDOWN_MS - Date.now() : 0;
  if (waitMs > 0) {
    return res.status(429).json({
      error: `You can ask for ratings on ${movie.title} once every 24 hours. Try again in ${formatWait(waitMs)}.`,
      nextRatingRequestAt: new Date(Date.now() + waitMs).toISOString(),
    });
  }

  const message = str(req.body?.message, 1000) ?? "";
  const feed = await Feed.create({
    type: "rating",
    author: req.user._id,
    authorName: req.user.name,
    movie: movie._id,
    filmTitle: movie.title,
    text: message,
    location: req.user.location?.toObject?.() ?? req.user.location,
  });
  movie.ratingFeed = feed._id;
  movie.ratingRequestedAt = new Date();
  movie.ratingRequestCount = (movie.ratingRequestCount ?? 0) + 1;
  await movie.save();
  res.status(201).json({ movie: serializeMovie(movie, req.user), feedId: feed._id.toString() });
});

async function findOpenMovie(req, res) {
  const movie = await findMovie(req, res);
  if (!movie) return null;
  if (!movie.ratingFeed) {
    res.status(400).json({ error: "The director hasn't opened ratings for this movie yet" });
    return null;
  }
  return movie;
}

router.put("/:id/rating", requireRole("audience"), async (req, res) => {
  const value = Number(req.body?.value);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    return res.status(400).json({ error: "Rating must be between 0.5 and 5" });
  }
  const movie = await findOpenMovie(req, res);
  if (!movie) return;
  const existing = movie.ratings.find((r) => r.user.equals(req.user._id));
  if (existing) existing.value = value;
  else movie.ratings.push({ user: req.user._id, value });
  await movie.save();
  res.json({ movie: serializeMovie(movie, req.user) });
});

/** PUT /api/movies/:id/review { text, rating? } — one review per audience member (posting again updates it). */
router.put("/:id/review", requireRole("audience"), async (req, res) => {
  const text = str(req.body?.text, 3000);
  if (!text) return res.status(400).json({ error: "Review can't be empty" });
  const rating = req.body?.rating === undefined || req.body?.rating === null ? null : Number(req.body.rating);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) {
    return res.status(400).json({ error: "Rating must be between 0.5 and 5" });
  }

  const movie = await findOpenMovie(req, res);
  if (!movie) return;

  const review = movie.reviews.find((r) => r.user.equals(req.user._id));
  if (review) review.text = text;
  else movie.reviews.push({ user: req.user._id, userName: req.user.name, text });

  if (rating !== null) {
    const existing = movie.ratings.find((r) => r.user.equals(req.user._id));
    if (existing) existing.value = rating;
    else movie.ratings.push({ user: req.user._id, value: rating });
  }
  await movie.save();
  res.json({ movie: serializeMovie(movie, req.user) });
});

router.delete("/:id/review", requireRole("audience"), async (req, res) => {
  const movie = await findMovie(req, res);
  if (!movie) return;
  movie.reviews = movie.reviews.filter((r) => !r.user.equals(req.user._id));
  await movie.save();
  res.json({ movie: serializeMovie(movie, req.user) });
});

export default router;
