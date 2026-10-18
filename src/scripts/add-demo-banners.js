/**
 * Adds banner images to the demo movies that don't have one yet (keeps everything else).
 * Usage: node --env-file-if-exists=.env src/scripts/add-demo-banners.js
 */
import mongoose from "mongoose";
import { config } from "../config.js";
import { DEMO_BANNERS } from "../demo/movies.js";
import { Movie } from "../models/Movie.js";
import { User } from "../models/User.js";

await mongoose.connect(config.mongoUri);
let updated = 0;
for (const [title, { director, bannerImage }] of Object.entries(DEMO_BANNERS)) {
  const user = await User.findOne({ email: director });
  if (!user) continue;
  const { modifiedCount } = await Movie.updateOne(
    { director: user._id, title, $or: [{ bannerImage: { $exists: false } }, { bannerImage: null }, { bannerImage: "" }] },
    { $set: { bannerImage } },
  );
  updated += modifiedCount;
}
console.log(`${mongoose.connection.host}: added banners to ${updated} demo movies.`);
await mongoose.disconnect();
