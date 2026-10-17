import mongoose from "mongoose";
import { locationSchema } from "./User.js";

const { ObjectId } = mongoose.Schema.Types;

const thoughtSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: "User", required: true },
    userName: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

/**
 * A director's feed.
 * - "update": text + optional images, audiences like and share thoughts.
 * - "rating": created by "Ask For Rating" on a movie, audiences rate and review that movie.
 */
const feedSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["update", "rating"], default: "update", index: true },
    author: { type: ObjectId, ref: "User", required: true, index: true },
    authorName: { type: String, required: true },
    movie: { type: ObjectId, ref: "Movie" },
    filmTitle: { type: String, trim: true, maxlength: 120 },
    text: { type: String, trim: true, maxlength: 5000, default: "" },
    /** "/res/<file>" for stored images, or absolute URLs for seeded ones */
    images: { type: [String], default: [] },
    location: { type: locationSchema, default: undefined },
    likes: { type: [{ type: ObjectId, ref: "User" }], default: [] },
    thoughts: { type: [thoughtSchema], default: [] },
    editedAt: { type: Date },
  },
  { timestamps: true },
);

feedSchema.index({ createdAt: -1 });

export const Feed = mongoose.model("Feed", feedSchema);
