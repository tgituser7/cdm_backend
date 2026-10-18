import { Router } from "express";
import mongoose from "mongoose";
import { requireRole } from "../middleware/auth.js";
import { movieImagePaths, removeStoredFiles, uploadMovieImages } from "../middleware/upload.js";
import { CERTIFICATIONS, Movie, RATING_REQUEST_COOLDOWN_MS, STATUSES, searchWords } from "../models/Movie.js";
import { Feed } from "../models/Feed.js";
import { serializeMovie, serializeMovieSummary } from "../utils/serialize.js";

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

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const one = (v) => (typeof v === "string" ? v.trim() : "");

/** Sort orders for the movie list; each one is backed by an index on the Movie model. */
const LIST_SORTS = {
  requested: { ratingOpen: -1, ratingRequestedAt: -1, createdAt: -1 },
  latest: { createdAt: -1 },
  top: { ratingAverage: -1, ratingCount: -1, createdAt: -1 },
  reviews: { reviewCount: -1, ratingCount: -1, createdAt: -1 },
  release: { releaseSort: 1, createdAt: -1 },
  title: { title: 1 },
};

/**
 * GET /api/movies — every director's movies. Search, filters, sorting and paging all run in MongoDB.
 *   q          search: every word must start a word of the title or director name ("sig 40" → "Signal 404")
 *   director   a director id, or "me"
 *   genre, language, status
 *   open=1     only movies whose ratings are open
 *   rated=1    only movies that have ratings
 *   sort       requested | latest | top | reviews | release | title
 *   page       0-based page (24 per page by default, max 60); without it, up to `limit` (max 200)
 */
router.get("/", async (req, res) => {
  const { director, rated, open } = req.query;
  const sort = LIST_SORTS[req.query.sort] ? req.query.sort : "latest";
  const genre = one(req.query.genre);
  const language = one(req.query.language);
  const status = one(req.query.status);
  const words = searchWords(one(req.query.q).slice(0, 80)).slice(0, 6);

  const query = {};
  if (director === "me") {
    if (!req.user) return res.json({ movies: [], total: 0, page: 0, hasMore: false });
    query.director = req.user._id;
  } else if (director && mongoose.isValidObjectId(director)) {
    query.director = director;
  }
  // Anchored, case-normalised prefixes can use the searchTerms index.
  if (words.length) query.searchTerms = { $all: words.map((w) => new RegExp(`^${escapeRegex(w)}`)) };
  if (genre) query.genres = genre;
  if (language) query.languages = language;
  if (STATUSES.includes(status)) query.status = status;
  if (open === "1") query.ratingOpen = true;
  if (rated) query.ratingCount = { $gt: 0 };

  const paged = req.query.page !== undefined;
  const page = paged ? Math.max(0, Number.parseInt(req.query.page, 10) || 0) : 0;
  const limit = paged ? Math.min(Math.max(Number(req.query.limit) || 24, 1), 60) : Math.min(Number(req.query.limit) || 200, 200);

  const find = Movie.find(query)
    .select("-ratings -reviews -searchTerms")
    .sort(LIST_SORTS[sort])
    .skip(page * limit)
    .limit(limit)
    .lean();
  if (sort === "title") find.collation({ locale: "en", strength: 2 });

  // With no filters, the collection's stored count is instant; otherwise count the matches (indexed).
  const count = Object.keys(query).length ? Movie.countDocuments(query) : Movie.estimatedDocumentCount();
  const [docs, total] = await Promise.all([find, count]);
  res.json({
    movies: docs.map(serializeMovieSummary),
    total,
    page,
    limit,
    hasMore: page * limit + docs.length < total,
  });
});

/** GET /api/movies/filters — options for the movie filters (only values that are in use). */
router.get("/filters", async (_req, res) => {
  const [genres, languages, directors] = await Promise.all([
    Movie.distinct("genres"),
    Movie.distinct("languages"),
    Movie.aggregate([
      { $group: { _id: "$director", name: { $first: "$directorName" }, movies: { $sum: 1 } } },
      { $sort: { name: 1 } },
    ]),
  ]);
  res.json({
    genres: genres.filter(Boolean).sort(),
    languages: languages.filter(Boolean).sort(),
    statuses: STATUSES,
    directors: directors.map((d) => ({ id: d._id.toString(), name: d.name, movies: d.movies })),
  });
});

router.get("/:id", async (req, res) => {
  const movie = await findMovie(req, res);
  if (movie) res.json({ movie: serializeMovie(movie, req.user) });
});

router.post("/", requireRole("director"), uploadMovieImages, async (req, res) => {
  const { movieImage, bannerImage } = movieImagePaths(req);
  const { out, errors } = readMovieFields({ ...req.body, title: req.body.title ?? "" });
  if (errors.length) {
    await removeStoredFiles([movieImage, bannerImage].filter(Boolean));
    return res.status(400).json({ error: errors[0] });
  }
  const movie = await Movie.create({ ...out, movieImage, bannerImage, director: req.user._id, directorName: req.user.name });
  res.status(201).json({ movie: serializeMovie(movie, req.user) });
});

router.patch("/:id", requireRole("director"), uploadMovieImages, async (req, res) => {
  const { movieImage: newMovieImage, bannerImage: newBannerImage } = movieImagePaths(req);
  const added = [newMovieImage, newBannerImage].filter(Boolean);
  const fail = async (status, error) => {
    await removeStoredFiles(added);
    return res.status(status).json({ error });
  };

  const movie = await findMovie(req, res);
  if (!movie) return removeStoredFiles(added);
  if (!movie.director.equals(req.user._id)) return fail(403, "You can only edit your own movies");

  const { out, errors } = readMovieFields(req.body);
  if (errors.length) return fail(400, errors[0]);

  const before = { movieImage: movie.movieImage, bannerImage: movie.bannerImage };
  movie.set(out);
  if (newMovieImage) movie.movieImage = newMovieImage;
  else if (req.body.removeMovieImage === "true") movie.movieImage = undefined;
  if (newBannerImage) movie.bannerImage = newBannerImage;
  else if (req.body.removeBannerImage === "true") movie.bannerImage = undefined;
  await movie.save();
  // Delete replaced or removed image files.
  await removeStoredFiles(
    [
      before.movieImage !== movie.movieImage && before.movieImage,
      before.bannerImage !== movie.bannerImage && before.bannerImage,
    ].filter(Boolean),
  );

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
  await removeStoredFiles([movie.movieImage, movie.bannerImage].filter(Boolean));
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
