/**
 * Resets the database with demo users and feeds.
 * Usage: npm run seed      (all demo accounts use the password "password123")
 */
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { config } from "./config.js";
import { addDemoMovies } from "./demo/movies.js";
import { Movie } from "./models/Movie.js";
import { Feed } from "./models/Feed.js";
import { User } from "./models/User.js";

const PLACES = {
  delhi: { city: "New Delhi", state: "Delhi", country: "India", lat: 28.6139, lng: 77.209 },
  bengaluru: { city: "Bengaluru", state: "Karnataka", country: "India", lat: 12.9716, lng: 77.5946 },
  udupi: { city: "Udupi", state: "Karnataka", country: "India", lat: 13.3409, lng: 74.7421 },
  mumbai: { city: "Mumbai", state: "Maharashtra", country: "India", lat: 19.076, lng: 72.8777 },
  pune: { city: "Pune", state: "Maharashtra", country: "India", lat: 18.5204, lng: 73.8567 },
  chennai: { city: "Chennai", state: "Tamil Nadu", country: "India", lat: 13.0827, lng: 80.2707 },
  madurai: { city: "Madurai", state: "Tamil Nadu", country: "India", lat: 9.9252, lng: 78.1198 },
};

const img = (id) => `https://images.unsplash.com/photo-${id}?w=1200&q=80&auto=format&fit=crop`;
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000);

await mongoose.connect(config.mongoUri);
await Promise.all([User.deleteMany({}), Feed.deleteMany({}), Movie.deleteMany({}), mongoose.connection.db.collection("sessions").deleteMany({})]);

// Uploaded images belong to the feeds being deleted.
for (const f of await fs.readdir(config.resDir)) {
  if (f !== ".gitkeep") await fs.unlink(path.join(config.resDir, f));
}

const passwordHash = await bcrypt.hash("password123", 12);
const mk = (name, email, role, location, bio) =>
  User.create({ name, email, role, passwordHash, location: { ...location, source: "manual" }, bio });

const arjun = await mk("Arjun Menon", "arjun@demo.in", "director", PLACES.delhi, "Director of The Last Projectionist.");
const anaya = await mk("Anaya Rao", "anaya@demo.in", "director", PLACES.bengaluru, "Kannada & Tamil filmmaker. Monsoon Letters, Half Light.");
const vikram = await mk("Vikram Sethi", "vikram@demo.in", "director", PLACES.mumbai, "Thrillers. Signal 404, Western Ghats.");
const rohit = await mk("Rohit", "rohit@demo.in", "audience", PLACES.bengaluru);
const meera = await mk("Meera", "meera@demo.in", "audience", PLACES.chennai);
const sam = await mk("Sam", "sam@demo.in", "audience", PLACES.mumbai);
const kavya = await mk("Kavya", "kavya@demo.in", "audience", PLACES.delhi);

const makeFeed = (author, data) => ({ author: author._id, authorName: author.name, ...data });
const comment = (user, text, h) => ({ user: user._id, userName: user.name, text, createdAt: hoursAgo(h) });

const docs = [
  makeFeed(arjun, {
    filmTitle: "The Last Projectionist",
    text: "Our premiere screening last night was sold out. 400 people in a 70-year-old single-screen theatre in Old Delhi. Thank you to everyone who came. This film is for every theatre we've lost. 🎞️",
    images: [img("1601506521793-dc748fc80b67"), img("1489599849927-2ee91cede3ba"), img("1524712245354-2c4e5e7121c0"), img("1598899134739-24c46f58b8c0")],
    location: PLACES.delhi,
    createdAt: hoursAgo(12),
    likes: [rohit._id, meera._id, sam._id, kavya._id],
    comments: [
      comment(kavya, "I was there! The whole hall stood up for the final reel. Unforgettable night.", 10),
      comment(rohit, "A love letter to cinema itself. Please bring it to Bengaluru next!", 2),
    ],
  }),
  makeFeed(anaya, {
    filmTitle: "Monsoon Letters",
    text: "Day 42. That's a wrap on the coastal schedule! We chased the rain for six weeks across Udupi and Kundapura, and it finally showed up on the very last day. Here's our clapper loader celebrating. 🌧️",
    images: [img("1485846234645-a62644f84728"), img("1505686994434-e3cc5abf1330")],
    location: PLACES.udupi,
    createdAt: hoursAgo(30),
    likes: [rohit._id, meera._id, sam._id],
    comments: [comment(meera, "Anaya Rao never misses. Counting the days to December.", 24)],
  }),
  makeFeed(anaya, {
    text: "I'll be at the Bengaluru International Film Festival next weekend, giving a talk on shooting in natural light on a small budget. If you're an aspiring filmmaker, come say hi! Ask your questions in the comments and I'll answer the best ones on stage. 🎤",
    location: PLACES.bengaluru,
    createdAt: hoursAgo(50),
    likes: [sam._id, meera._id],
    comments: [comment(sam, "How do you handle continuity when the light keeps changing through the day?", 46)],
  }),
  makeFeed(vikram, {
    filmTitle: "Signal 404",
    text: "First look at our lead in the control room. The whole film takes place over 11 hours, and we lit every scene using only practical screens and monitors. No film lights at all. Teaser drops next Friday.",
    images: [img("1594909122845-11baa439b7bf")],
    location: PLACES.mumbai,
    createdAt: hoursAgo(72),
    likes: [meera._id, kavya._id],
    comments: [comment(sam, "Lit only with screens?! That's wild. The colours look incredible.", 70)],
  }),
  makeFeed(arjun, {
    filmTitle: "The Last Projectionist",
    text: "We found this 1958 projector in a scrap shop in Chandni Chowk. It took three months to restore, and it's now a character in the film. Every frame you see in the projection booth scenes actually ran through it.",
    images: [img("1440404653325-ab127d49abc1"), img("1478720568477-152d9b164e26"), img("1542204165-65bf26472b9b")],
    location: PLACES.delhi,
    createdAt: hoursAgo(120),
    likes: [rohit._id, sam._id],
  }),
  makeFeed(vikram, {
    filmTitle: "Western Ghats",
    text: "Some news: my next film is officially greenlit! 🎉 Three estranged brothers, one trek through the Sahyadris, and their father's ashes. We start the location recce next month. Casting calls will be shared here first.",
    location: PLACES.pune,
    createdAt: hoursAgo(170),
    likes: [kavya._id],
  }),
  makeFeed(anaya, {
    filmTitle: "Half Light",
    text: "Our little comedy Half Light now has a release date: 14 March 2027! Five neighbours, one generator and a wedding in three days. The trailer comes out on our cinema-hall tour, starting here. 🍿",
    images: [img("1536440136628-849c177e76a1")],
    location: PLACES.madurai,
    createdAt: hoursAgo(220),
    likes: [kavya._id],
  }),
];

const inserted = await Feed.insertMany(docs);
// insertMany applies timestamps; restore the intended demo dates.
await Promise.all(
  inserted.map((p, i) =>
    Feed.collection.updateOne({ _id: p._id }, { $set: { createdAt: docs[i].createdAt, updatedAt: docs[i].createdAt } }),
  ),
);

const movies = await addDemoMovies();
console.log(`Seeded ${await User.countDocuments()} users, ${movies} movies and ${await Feed.countDocuments()} feeds.`);
console.log("Demo logins (password: password123):");
for (const u of await User.find().sort({ role: -1 })) console.log(`  ${u.role.padEnd(8)} ${u.email.padEnd(16)} ${u.location?.city}`);
await mongoose.disconnect();
