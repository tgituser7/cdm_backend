/**
 * Non-destructive upgrade for an existing database:
 *  - adds the demo movies + rating feeds for the demo directors (skips ones that exist)
 *  - removes the old per-feed `ratings` field (ratings now live on movies)
 * Usage: npm run seed:movies
 */
import mongoose from "mongoose";
import { config } from "../config.js";
import { addDemoMovies } from "../demo/movies.js";

await mongoose.connect(config.mongoUri);
const added = await addDemoMovies();
const { modifiedCount } = await mongoose.connection.db
  .collection("feeds")
  .updateMany({ ratings: { $exists: true } }, { $unset: { ratings: "" } });
console.log(`Added ${added} demo movies. Cleared old feed ratings on ${modifiedCount} feeds.`);
await mongoose.disconnect();
