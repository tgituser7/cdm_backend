/**
 * Performance check for the Movies page queries on a large catalogue.
 * Fills a SEPARATE database with synthetic movies (never your real one).
 * Usage: MONGODB_URI=mongodb://127.0.0.1:27017/dharshak_manch_bench node src/scripts/bench-movies.js [count]
 */
import mongoose from "mongoose";
import { config } from "../config.js";
import { CERTIFICATIONS, Movie, STATUSES, backfillMovieDerivedFields } from "../models/Movie.js";

if (!/bench/.test(config.mongoUri)) {
  console.error("Refusing to run: MONGODB_URI must point at a database whose name contains 'bench'.");
  process.exit(1);
}

const COUNT = Number(process.argv[2]) || 20000;
const WORDS = ["Monsoon", "Letters", "Signal", "Half", "Light", "Western", "Ghats", "Last", "Projectionist", "Kaveri", "Express", "Midnight", "Raga", "Shadow", "River", "Silent", "City", "Golden", "Dust", "Road", "Desert", "Bloom", "Echo", "Thunder", "Paper", "Moon", "Tiger", "Lantern", "Harbour", "Saffron"];
const FIRST = ["Anaya", "Vikram", "Arjun", "Meera", "Rohan", "Kavya", "Ishaan", "Priya", "Dev", "Sana", "Kabir", "Diya"];
const LAST = ["Rao", "Sethi", "Menon", "Iyer", "Kapoor", "Nair", "Shetty", "Desai", "Bhatt", "Khan", "Das", "Reddy"];
const GENRES = ["Drama", "Thriller", "Comedy", "Action", "Romance", "Horror", "Sci-Fi", "Adventure", "Crime", "Family"];
const LANGS = ["Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Marathi", "Bengali", "Punjabi"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

await mongoose.connect(config.mongoUri);
await Movie.deleteMany({});
await Movie.syncIndexes();

const directors = Array.from({ length: 300 }, () => ({ id: new mongoose.Types.ObjectId(), name: `${pick(FIRST)} ${pick(LAST)}` }));
let t = Date.now();
const batch = [];
for (let i = 0; i < COUNT; i++) {
  const d = pick(directors);
  const open = Math.random() < 0.15;
  const ratings = Array.from({ length: Math.floor(Math.random() * 12) }, () => ({ user: new mongoose.Types.ObjectId(), value: 1 + Math.floor(Math.random() * 10) }));
  batch.push({
    director: d.id,
    directorName: d.name,
    title: `${pick(WORDS)} ${pick(WORDS)}${Math.random() < 0.3 ? ` ${100 + i}` : ""}`,
    genres: [pick(GENRES), pick(GENRES)],
    languages: [pick(LANGS)],
    status: pick(STATUSES),
    certification: pick(CERTIFICATIONS),
    releaseDate: Math.random() < 0.8 ? new Date(Date.now() + (Math.random() - 0.5) * 6e10) : undefined,
    ratingFeed: open ? new mongoose.Types.ObjectId() : undefined,
    ratingRequestedAt: open ? new Date(Date.now() - Math.random() * 3e9) : undefined,
    ratings,
    reviews: ratings.slice(0, 3).map((r) => ({ user: r.user, userName: "Viewer", text: "Loved it. ".repeat(20) })),
    createdAt: new Date(Date.now() - Math.random() * 3e10),
  });
  if (batch.length === 2000) await Movie.collection.insertMany(batch.splice(0));
}
if (batch.length) await Movie.collection.insertMany(batch);
console.log(`Inserted ${COUNT} movies in ${Date.now() - t} ms`);
t = Date.now();
console.log(`Backfilled derived fields on ${await backfillMovieDerivedFields()} movies in ${Date.now() - t} ms`);

// Check which index each Movies-page query uses (explain), mirroring routes/movies.js
const cases = {
  "search 'mons'": [{ searchTerms: { $all: [/^mons/] } }, { createdAt: -1 }],
  "search 'tiger moon'": [{ searchTerms: { $all: [/^tiger/, /^moon/] } }, { createdAt: -1 }],
  "genre=Drama": [{ genres: "Drama" }, { createdAt: -1 }],
  "open + recently asked": [{ ratingOpen: true }, { ratingOpen: -1, ratingRequestedAt: -1, createdAt: -1 }],
  "default: recently asked": [{}, { ratingOpen: -1, ratingRequestedAt: -1, createdAt: -1 }],
  "top rated": [{}, { ratingAverage: -1, ratingCount: -1, createdAt: -1 }],
  "release date": [{}, { releaseSort: 1, createdAt: -1 }],
};
for (const [name, [query, sort]] of Object.entries(cases)) {
  const plan = await Movie.find(query).sort(sort).limit(24).explain("executionStats");
  const stats = plan.executionStats ?? plan[0]?.executionStats;
  const stages = JSON.stringify(plan.queryPlanner?.winningPlan ?? plan[0]?.queryPlanner?.winningPlan);
  const index = [...stages.matchAll(/"indexName":"([^"]+)"/g)].map((m) => m[1]);
  console.log(`${name.padEnd(26)} ${String(stats.executionTimeMillis).padStart(3)} ms  examined ${String(stats.totalDocsExamined).padStart(5)} docs  index: ${index.join(", ") || "none (collection scan)"}`);
}
await mongoose.disconnect();
