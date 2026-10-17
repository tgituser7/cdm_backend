/**
 * One-off: convert movies' old fixed `crew` fields into the free-form `team` list.
 * Safe to run more than once. Usage: node --env-file-if-exists=.env src/scripts/migrate-crew-to-team.js
 */
import mongoose from "mongoose";
import { config } from "../config.js";

const LABELS = { writer: "Writer", producer: "Producer", music: "Music Director", cinematography: "Cinematographer", editing: "Editor" };

await mongoose.connect(config.mongoUri);
const movies = mongoose.connection.db.collection("movies");
let converted = 0;
for await (const m of movies.find({ crew: { $exists: true } })) {
  const team = Object.entries(m.crew ?? {})
    .filter(([, name]) => name)
    .map(([key, name]) => ({ role: LABELS[key] ?? key, name }));
  await movies.updateOne({ _id: m._id }, { $set: { team: [...(m.team ?? []), ...team] }, $unset: { crew: "" } });
  converted += 1;
}
console.log(`Converted ${converted} movies from crew to team.`);
await mongoose.disconnect();
