import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

export const CERTIFICATIONS = ["U", "UA 7+", "UA 13+", "UA 16+", "A", "S"];
export const STATUSES = ["Announced", "Releasing soon", "Released"];
/** A director can ask for ratings on the same movie once every 24 hours. */
export const RATING_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const castSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    role: { type: String, trim: true, maxlength: 80 },
  },
  { _id: false },
);

/** A team member and the role the director gives them, e.g. { role: "Music Director", name: "A. R. Rahman" } */
const teamSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, trim: true, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { _id: false },
);

const ratingSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    value: { type: Number, required: true, min: 1, max: 10 },
  },
  { _id: false },
);

const reviewSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    userName: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 3000 },
  },
  { timestamps: true },
);

/** A director's film with its full details; audiences rate and review it once the director asks. */
const movieSchema = new mongoose.Schema(
  {
    director: { type: ObjectId, ref: "User", required: true, index: true },
    directorName: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    tagline: { type: String, trim: true, maxlength: 160 },
    synopsis: { type: String, trim: true, maxlength: 4000 },
    genres: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    releaseDate: { type: Date },
    runtimeMinutes: { type: Number, min: 1, max: 600 },
    certification: { type: String, enum: CERTIFICATIONS },
    status: { type: String, enum: STATUSES, default: "Announced" },
    cast: { type: [castSchema], default: [] },
    team: { type: [teamSchema], default: [] },
    /** "/res/<file>" or an absolute URL */
    movieImage: { type: String },
    /** Optional wide (16:9) banner shown in the home page hero and on the movie page; "/res/<file>" or a URL */
    bannerImage: { type: String },
    trailerUrl: { type: String, trim: true, maxlength: 300 },
    /**
     * The latest rating feed shared via "Ask For Rating"; ratings and reviews are open while one exists.
     * Ratings and reviews live on the movie, so every new rating feed carries the earlier ones.
     */
    ratingFeed: { type: ObjectId, ref: "Feed" },
    ratingRequestedAt: { type: Date },
    ratingRequestCount: { type: Number, default: 0 },
    ratings: { type: [ratingSchema], default: [] },
    reviews: { type: [reviewSchema], default: [] },

    /*
     * Derived fields, kept in sync on every save (see the pre-save hook below), so the
     * movie list can search, filter and sort inside MongoDB using indexes.
     */
    /** Lowercase words from the title and director name, for indexed prefix search */
    searchTerms: { type: [String], default: [] },
    ratingCount: { type: Number, default: 0 },
    /** Average rating (1–10), null when unrated */
    ratingAverage: { type: Number, default: null },
    reviewCount: { type: Number, default: 0 },
    ratingOpen: { type: Boolean, default: false },
    /** releaseDate, or far in the future when unknown — so "release date" sorting puts unknown dates last */
    releaseSort: { type: Date },
  },
  { timestamps: true },
);

const NO_RELEASE_DATE = new Date("9999-12-31T00:00:00.000Z");

/** Lowercase words (any script: Latin, Devanagari, Tamil, …) of a text. */
export function searchWords(text) {
  return (text ?? "").toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

/** The derived search/sort fields for a movie (document or plain object). */
function derivedFields(m) {
  const ratings = m.ratings ?? [];
  return {
    searchTerms: [...new Set([...searchWords(m.title), ...searchWords(m.directorName)])],
    ratingCount: ratings.length,
    ratingAverage: ratings.length ? ratings.reduce((n, r) => n + r.value, 0) / ratings.length : null,
    reviewCount: (m.reviews ?? []).length,
    ratingOpen: !!m.ratingFeed,
    releaseSort: m.releaseDate ?? NO_RELEASE_DATE,
  };
}

movieSchema.pre("save", function syncDerivedFields() {
  Object.assign(this, derivedFields(this));
});

// Indexes for the Movies page: search, each filter, and each sort order.
movieSchema.index({ searchTerms: 1 });
movieSchema.index({ genres: 1 });
movieSchema.index({ languages: 1 });
movieSchema.index({ status: 1 });
movieSchema.index({ director: 1, createdAt: -1 });
movieSchema.index({ createdAt: -1 });
movieSchema.index({ ratingOpen: -1, ratingRequestedAt: -1, createdAt: -1 });
movieSchema.index({ ratingAverage: -1, ratingCount: -1, createdAt: -1 });
movieSchema.index({ reviewCount: -1, ratingCount: -1, createdAt: -1 });
movieSchema.index({ releaseSort: 1, createdAt: -1 });
movieSchema.index({ title: 1 }, { collation: { locale: "en", strength: 2 } });

export const Movie = mongoose.model("Movie", movieSchema);

/**
 * Fill the derived fields on movies saved before they existed (runs at startup; a no-op once done).
 * Uses plain $set updates, so it's safe even if two server processes start at the same time,
 * and it never stops the server from starting.
 */
export async function backfillMovieDerivedFields() {
  try {
    // Make the collection's indexes match the ones defined above (adds new, drops outdated).
    await Movie.syncIndexes();
    const stale = await Movie.find({ $or: [{ searchTerms: { $exists: false } }, { searchTerms: { $size: 0 } }, { releaseSort: { $exists: false } }] })
      .select("title directorName ratings reviews ratingFeed releaseDate")
      .lean();
    if (!stale.length) return 0;
    await Movie.bulkWrite(stale.map((m) => ({ updateOne: { filter: { _id: m._id }, update: { $set: derivedFields(m) }, timestamps: false } })));
    return stale.length;
  } catch (err) {
    console.error("Could not update movie search/sort fields:", err.message);
    return 0;
  }
}
