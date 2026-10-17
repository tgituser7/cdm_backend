import { Router } from "express";
import mongoose from "mongoose";
import { requireRole } from "../middleware/auth.js";
import { MAX_IMAGES, removeStoredFiles, uploadImages } from "../middleware/upload.js";
import { Movie } from "../models/Movie.js";
import { Feed } from "../models/Feed.js";
import { parseLocation } from "../utils/location.js";
import { movieAverage, serializeFeed } from "../utils/serialize.js";

const router = Router();

const clean = ({ _tier, ...rest }) => rest;

async function findFeed(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: "Feed not found" });
    return null;
  }
  const feed = await Feed.findById(req.params.id).populate("movie");
  if (!feed) res.status(404).json({ error: "Feed not found" });
  return feed;
}

/**
 * Map feed id -> movie id for normal feeds whose film tag matches one of their director's movies
 * (case-insensitive title match), so the tag can link to the movie page.
 */
async function movieLinks(feeds) {
  const tagged = feeds.filter((p) => p.type !== "rating" && p.filmTitle);
  if (!tagged.length) return new Map();
  const movies = await Movie.find({ director: { $in: [...new Set(tagged.map((p) => p.author.toString()))] } }).select("title director");
  const byKey = new Map(movies.map((m) => [`${m.director}|${m.title.trim().toLowerCase()}`, m._id.toString()]));
  const links = new Map();
  for (const p of tagged) {
    const id = byKey.get(`${p.author}|${p.filmTitle.trim().toLowerCase()}`);
    if (id) links.set(p._id.toString(), id);
  }
  return links;
}

/** Serialize one feed for a response, including its movie link. */
async function output(feed, viewer) {
  const links = await movieLinks([feed]);
  return clean(serializeFeed(feed, viewer, { movieId: links.get(feed._id.toString()) }));
}

/** Likes and comments belong to normal feeds; rating feeds use the movie's ratings and reviews. */
function rejectRatingFeed(feed, res) {
  if (feed.type !== "rating") return false;
  res.status(400).json({ error: "Rating feeds take ratings and reviews instead of likes and comments" });
  return true;
}

/**
 * GET /api/feeds?sort=latest|top|liked&filter=all|rating|films|other&author=<id>
 * Feeds near the viewer's location come first, then the rest; each group is ordered by `sort`.
 */
router.get("/", async (req, res) => {
  const { sort = "latest", filter = "all", author } = req.query;

  const query = {};
  const updates = { type: { $ne: "rating" } };
  if (filter === "rating") query.type = "rating";
  if (filter === "films") Object.assign(query, updates, { filmTitle: { $nin: [null, ""] } });
  if (filter === "other") Object.assign(query, updates, { $or: [{ filmTitle: null }, { filmTitle: "" }] });
  if (author && mongoose.isValidObjectId(author)) query.author = author;

  const feeds = await Feed.find(query).sort({ createdAt: -1 }).limit(200).populate("movie");
  const score = (p) => (p.type === "rating" ? (movieAverage(p.movie) ?? 0) : 0);
  const votes = (p) => (p.type === "rating" ? (p.movie?.ratings.length ?? 0) : 0);

  const byKey = {
    latest: (a, b) => b.createdAt - a.createdAt,
    top: (a, b) => score(b) - score(a) || votes(b) - votes(a),
    liked: (a, b) => b.likes.length - a.likes.length,
  };
  const cmp = byKey[sort] ?? byKey.latest;

  const links = await movieLinks(feeds);
  const rows = feeds.map((p) => ({ doc: p, out: serializeFeed(p, req.user, { movieId: links.get(p._id.toString()) }) }));
  rows.sort((a, b) => a.out._tier - b.out._tier || cmp(a.doc, b.doc) || b.doc.createdAt - a.doc.createdAt);

  res.json({
    feeds: rows.map((r) => clean(r.out)),
    viewerLocation: req.user?.location ?? null,
  });
});

router.get("/:id", async (req, res) => {
  const feed = await findFeed(req, res);
  if (feed) res.json({ feed: await output(feed, req.user) });
});

router.post("/", requireRole("director"), uploadImages, async (req, res) => {
  const files = req.files ?? [];
  const images = files.map((f) => `/res/${f.filename}`);
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  const filmTitle = typeof req.body.filmTitle === "string" ? req.body.filmTitle.trim().slice(0, 120) : "";

  if (!text && images.length === 0) {
    await removeStoredFiles(images);
    return res.status(400).json({ error: "Write something or add an image" });
  }

  // Location of the feed: what the director entered, else their profile location.
  let location = req.user.location?.toObject?.() ?? req.user.location;
  if (req.body.city) {
    const parsed = parseLocation({ city: req.body.city, state: req.body.state, country: req.body.country });
    if (parsed.error) {
      await removeStoredFiles(images);
      return res.status(400).json({ error: parsed.error });
    }
    location = parsed.value;
  }

  const feed = await Feed.create({
    author: req.user._id,
    authorName: req.user.name,
    filmTitle: filmTitle || undefined,
    text,
    images,
    location,
  });
  res.status(201).json({ feed: await output(feed, req.user) });
});

/**
 * PATCH /api/feeds/:id (multipart) — edit your own feed.
 * Fields: text, filmTitle, city, state, keepImages (JSON array of current image paths to keep),
 * images (new files). Omitted fields stay unchanged; images not listed in keepImages are deleted.
 */
router.patch("/:id", requireRole("director"), uploadImages, async (req, res) => {
  const added = (req.files ?? []).map((f) => `/res/${f.filename}`);
  const fail = async (status, error) => {
    await removeStoredFiles(added);
    return res.status(status).json({ error });
  };

  const feed = await findFeed(req, res);
  if (!feed) return removeStoredFiles(added);
  if (!feed.author.equals(req.user._id)) return fail(403, "You can only edit your own feeds");

  if (feed.type === "rating") {
    if (added.length) await removeStoredFiles(added);
    if (typeof req.body.text === "string") feed.text = req.body.text.trim().slice(0, 1000);
    feed.editedAt = new Date();
    await feed.save();
    return res.json({ feed: await output(feed, req.user) });
  }

  let kept = feed.images;
  if (req.body.keepImages !== undefined) {
    try {
      const wanted = JSON.parse(req.body.keepImages);
      if (!Array.isArray(wanted)) throw new Error();
      kept = feed.images.filter((src) => wanted.includes(src));
    } catch {
      return fail(400, "Invalid image list");
    }
  }
  const images = [...kept, ...added];
  if (images.length > MAX_IMAGES) return fail(400, `A feed can have up to ${MAX_IMAGES} images`);

  const text = typeof req.body.text === "string" ? req.body.text.trim() : feed.text;
  if (!text && images.length === 0) return fail(400, "Write something or add an image");

  if (typeof req.body.filmTitle === "string") feed.filmTitle = req.body.filmTitle.trim().slice(0, 120) || undefined;

  if (typeof req.body.city === "string") {
    if (req.body.city.trim()) {
      const parsed = parseLocation({ city: req.body.city, state: req.body.state, country: req.body.country });
      if (parsed.error) return fail(400, parsed.error);
      feed.location = parsed.value;
    } else {
      feed.location = undefined;
    }
  }

  const removed = feed.images.filter((src) => !kept.includes(src));
  feed.text = text;
  feed.images = images;
  feed.editedAt = new Date();
  await feed.save();
  await removeStoredFiles(removed);
  res.json({ feed: await output(feed, req.user) });
});

router.delete("/:id", requireRole("director"), async (req, res) => {
  const feed = await findFeed(req, res);
  if (!feed) return;
  if (!feed.author.equals(req.user._id)) return res.status(403).json({ error: "You can only delete your own feeds" });
  await feed.deleteOne();
  await removeStoredFiles(feed.images);
  if (feed.type === "rating" && feed.movie) {
    // If this was the movie's current rating feed, fall back to its most recent remaining one (or close ratings).
    const movie = await Movie.findById(feed.movie._id);
    if (movie?.ratingFeed?.equals(feed._id)) {
      const latest = await Feed.findOne({ movie: movie._id, type: "rating" }).sort({ createdAt: -1 });
      movie.ratingFeed = latest?._id;
      await movie.save();
    }
  }
  res.json({ ok: true });
});

router.post("/:id/like", requireRole("audience"), async (req, res) => {
  const feed = await findFeed(req, res);
  if (!feed || rejectRatingFeed(feed, res)) return;
  const liked = feed.likes.some((id) => id.equals(req.user._id));
  if (liked) feed.likes.pull(req.user._id);
  else feed.likes.push(req.user._id);
  await feed.save();
  res.json({ feed: await output(feed, req.user) });
});

router.post("/:id/comments", requireRole("audience"), async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Comment can't be empty" });
  if (text.length > 1000) return res.status(400).json({ error: "Comment is too long" });

  const feed = await findFeed(req, res);
  if (!feed || rejectRatingFeed(feed, res)) return;
  feed.comments.push({ user: req.user._id, userName: req.user.name, text });
  await feed.save();
  res.status(201).json({ feed: await output(feed, req.user) });
});

export default router;
