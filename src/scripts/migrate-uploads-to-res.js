/**
 * One-off: stored images moved from /uploads/<file> to /res/<file>.
 * Rewrites the saved paths in feeds and movies. Safe to run more than once.
 * Usage: node --env-file-if-exists=.env src/scripts/migrate-uploads-to-res.js
 */
import mongoose from "mongoose";
import { config } from "../config.js";

const OLD = "/uploads/";
const NEW = "/res/";
const startsWithOld = { $regex: "^/uploads/" };
const swap = (input) => ({ $replaceOne: { input, find: OLD, replacement: NEW } });

await mongoose.connect(config.mongoUri);
const db = mongoose.connection.db;

const feeds = await db.collection("feeds").updateMany({ images: startsWithOld }, [
  { $set: { images: { $map: { input: "$images", as: "src", in: swap("$$src") } } } },
]);
const movies = await db.collection("movies").updateMany({ movieImage: startsWithOld }, [
  { $set: { movieImage: swap("$movieImage") } },
]);

console.log(`${mongoose.connection.host}: updated ${feeds.modifiedCount} feeds and ${movies.modifiedCount} movies.`);
await mongoose.disconnect();
