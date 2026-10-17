/**
 * One-off: feed "comments" are now called "thoughts".
 * Renames the stored field on every feed. Safe to run more than once.
 * Usage: node --env-file-if-exists=.env src/scripts/migrate-comments-to-thoughts.js
 */
import mongoose from "mongoose";
import { config } from "../config.js";

await mongoose.connect(config.mongoUri);
const { modifiedCount } = await mongoose.connection.db
  .collection("feeds")
  .updateMany({ comments: { $exists: true } }, { $rename: { comments: "thoughts" } });
console.log(`${mongoose.connection.host}: renamed comments → thoughts on ${modifiedCount} feeds.`);
await mongoose.disconnect();
