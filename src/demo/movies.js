import { Movie } from "../models/Movie.js";
import { Feed } from "../models/Feed.js";
import { User } from "../models/User.js";

const bannerImg = (id) => `https://images.unsplash.com/photo-${id}?w=1920&h=900&q=80&auto=format&fit=crop`;
const movieImg = (id) => `https://images.unsplash.com/photo-${id}?w=600&h=900&q=80&auto=format&fit=crop`;
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000);

/** Demo movies for the demo directors. `rating` opens ratings with a rating feed. */
const DEMO_MOVIES = [
  {
    director: "arjun@demo.in",
    title: "The Last Projectionist",
    tagline: "Every frame he saved was a life he lived.",
    synopsis:
      "The final single-screen theatre in Old Delhi is closing. Its 74-year-old projectionist has one last night, and one last reel he has never shown anyone.",
    genres: ["Drama"],
    languages: ["Urdu", "Hindi"],
    releaseDate: "2027-02-09",
    runtimeMinutes: 132,
    certification: "UA 13+",
    status: "Releasing soon",
    cast: [
      { name: "Imran Siddiqui", role: "Rahmat Ali" },
      { name: "Zoya Mirza", role: "Noor" },
      { name: "Kabir Sethi", role: "Young Rahmat" },
    ],
    team: [{ role: "Writer", name: "Arjun Menon" }, { role: "Producer", name: "Old City Pictures" }, { role: "Music Director", name: "Rekha Iyer" }, { role: "Cinematographer", name: "Dev Malhotra" }, { role: "Editor", name: "Sana Kapoor" }],
    movieImage: movieImg("1478720568477-152d9b164e26"),
    bannerImage: bannerImg("1517604931442-7e0c8ed2963c"),
    rating: {
      message: "Our festival cut is locked! 🎞️ If you caught the premiere screening, tell us what you thought: rate it and leave a review.",
      at: 6,
      ratings: { "rohit@demo.in": 10, "meera@demo.in": 9, "sam@demo.in": 9 },
      reviews: [
        ["kavya@demo.in", "A love letter to cinema itself. The final reel had the whole hall on its feet.", 5],
        ["rohit@demo.in", "Imran Siddiqui is extraordinary. Quiet, heartbreaking, and beautifully shot.", 4],
      ],
    },
  },
  {
    director: "anaya@demo.in",
    title: "Monsoon Letters",
    tagline: "Some words arrive only with the rain.",
    synopsis:
      "A retired postman in coastal Karnataka discovers a bundle of undelivered letters from 1987 and sets out to deliver every one of them before the monsoon ends.",
    genres: ["Drama"],
    languages: ["Kannada"],
    releaseDate: "2026-12-04",
    runtimeMinutes: 118,
    certification: "U",
    status: "Releasing soon",
    cast: [
      { name: "Prakash Hegde", role: "Shankar" },
      { name: "Ananya Shetty", role: "Lakshmi" },
    ],
    team: [{ role: "Writer", name: "Anaya Rao" }, { role: "Producer", name: "Coastline Films" }, { role: "Music Director", name: "Vasuki Rao" }, { role: "Cinematographer", name: "Meghna Kulkarni" }],
    movieImage: movieImg("1524712245354-2c4e5e7121c0"),
    bannerImage: bannerImg("1515694346937-94d85e41e6f0"),
    rating: {
      message: "The trailer is out and our preview screenings are done. Rate Monsoon Letters and tell us what you felt! 🌧️",
      at: 20,
      ratings: { "rohit@demo.in": 9, "meera@demo.in": 8, "sam@demo.in": 10, "kavya@demo.in": 9 },
      reviews: [["meera@demo.in", "Anaya Rao never misses. Patient, gentle storytelling and that rain-soaked climax!", 3]],
    },
  },
  {
    director: "vikram@demo.in",
    title: "Signal 404",
    tagline: "The city went dark. The phones did not.",
    synopsis:
      "When every screen in Mumbai starts broadcasting the same countdown, a burnt-out network engineer has eleven hours to find out who is sending it, and why her name is on the list.",
    genres: ["Thriller", "Sci-Fi"],
    languages: ["Hindi"],
    releaseDate: "2027-01-22",
    runtimeMinutes: 126,
    certification: "UA 16+",
    status: "Releasing soon",
    cast: [
      { name: "Ritika Desai", role: "Aditi Rao" },
      { name: "Farzan Bhatt", role: "Inspector Kale" },
    ],
    team: [{ role: "Writer", name: "Vikram Sethi" }, { role: "Producer", name: "Static Frame Studios" }, { role: "Music Director", name: "Neel Dsouza" }, { role: "Cinematographer", name: "Arvind Nair" }, { role: "Editor", name: "Pooja Rane" }],
    movieImage: movieImg("1594909122845-11baa439b7bf"),
    bannerImage: bannerImg("1477959858617-67f85cf4f1df"),
    rating: {
      message: "The teaser is live. Based on what you've seen so far, how excited are you for Signal 404? Rate it and share your theories!",
      at: 40,
      ratings: { "meera@demo.in": 7, "sam@demo.in": 8 },
      reviews: [["sam@demo.in", "Lit only with screens?! The teaser looks wild. Can't wait for January.", 30]],
    },
  },
  {
    director: "anaya@demo.in",
    title: "Half Light",
    tagline: "A comedy about the longest power cut in history.",
    synopsis: "Five neighbours, one generator and a wedding in three days. A warm ensemble comedy set over a single sweltering summer week in Madurai.",
    genres: ["Comedy"],
    languages: ["Tamil"],
    releaseDate: "2027-03-14",
    runtimeMinutes: 104,
    certification: "U",
    status: "Announced",
    cast: [
      { name: "Karthik Subramaniam", role: "Murali" },
      { name: "Divya Raman", role: "Selvi" },
    ],
    team: [{ role: "Writer", name: "Anaya Rao" }, { role: "Music Director", name: "G. Senthil" }],
    movieImage: movieImg("1536440136628-849c177e76a1"),
    bannerImage: bannerImg("1500964757637-c85e8a162699"),
  },
  {
    director: "vikram@demo.in",
    title: "Western Ghats",
    tagline: "Nobody walks out of the forest the same.",
    synopsis: "Three estranged brothers trek into the Sahyadri ranges to scatter their father's ashes. The forest has other plans.",
    genres: ["Adventure", "Drama"],
    languages: ["Marathi"],
    status: "Announced",
    team: [{ role: "Writer", name: "Vikram Sethi" }],
    movieImage: movieImg("1542204165-65bf26472b9b"),
    bannerImage: bannerImg("1448375240586-882707db888b"),
  },
];

/**
 * Add the demo movies (and their rating feeds) for whichever demo directors exist.
 * Safe to run more than once: movies that already exist are skipped. Returns the number added.
 */
/** Banner images for the demo movies, by title (used by scripts/add-demo-banners.js). */
export const DEMO_BANNERS = Object.fromEntries(
  DEMO_MOVIES.filter((m) => m.bannerImage).map((m) => [m.title, { director: m.director, bannerImage: m.bannerImage }]),
);

export async function addDemoMovies() {
  const users = new Map((await User.find({ email: /@demo\.in$/ })).map((u) => [u.email, u]));
  let added = 0;

  for (const { director: email, rating, ...data } of DEMO_MOVIES) {
    const director = users.get(email);
    if (!director || (await Movie.exists({ director: director._id, title: data.title }))) continue;

    const movie = new Movie({ ...data, director: director._id, directorName: director.name });
    if (rating) {
      for (const [userEmail, value] of Object.entries(rating.ratings)) {
        const u = users.get(userEmail);
        if (u) movie.ratings.push({ user: u._id, value });
      }
      for (const [userEmail, text, h] of rating.reviews) {
        const u = users.get(userEmail);
        if (u) movie.reviews.push({ user: u._id, userName: u.name, text, createdAt: hoursAgo(h), updatedAt: hoursAgo(h) });
      }
      const feed = await Feed.create({
        type: "rating",
        author: director._id,
        authorName: director.name,
        movie: movie._id,
        filmTitle: data.title,
        text: rating.message,
        location: director.location?.toObject?.() ?? director.location,
      });
      await Feed.collection.updateOne({ _id: feed._id }, { $set: { createdAt: hoursAgo(rating.at), updatedAt: hoursAgo(rating.at) } });
      movie.ratingFeed = feed._id;
      movie.ratingRequestedAt = hoursAgo(rating.at);
      movie.ratingRequestCount = 1;
    }
    await movie.save();
    added += 1;
  }
  return added;
}
