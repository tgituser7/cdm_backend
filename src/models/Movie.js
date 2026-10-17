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
    /** "/uploads/<file>" or an absolute URL */
    movieImage: { type: String },
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
  },
  { timestamps: true },
);

export const Movie = mongoose.model("Movie", movieSchema);
