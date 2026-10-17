import { RATING_REQUEST_COOLDOWN_MS } from "../models/Movie.js";
import { proximity } from "./location.js";

const iso = (d) => (d ? d.toISOString() : undefined);
const isRatingOpen = (movie) => !!movie.ratingFeed;

export function movieAverage(movie) {
  if (!movie?.ratings?.length) return null;
  return movie.ratings.reduce((n, r) => n + r.value, 0) / movie.ratings.length;
}

/** Rating summary shared by movie and rating-feed responses. */
function ratingSummary(movie, viewer) {
  const histogram = Array.from({ length: 10 }, () => 0);
  for (const r of movie.ratings) histogram[r.value - 1] += 1;
  const mine = viewer ? movie.ratings.find((r) => r.user.equals(viewer._id)) : null;
  const myReview = viewer ? movie.reviews.find((r) => r.user.equals(viewer._id)) : null;
  const ratingByUser = new Map(movie.ratings.map((r) => [r.user.toString(), r.value]));
  return {
    ratingOpen: isRatingOpen(movie),
    ratingFeedId: movie.ratingFeed ? movie.ratingFeed.toString() : null,
    average: movieAverage(movie),
    ratingCount: movie.ratings.length,
    histogram,
    myRating: mine?.value ?? null,
    myReviewId: myReview ? myReview._id.toString() : null,
    reviewCount: movie.reviews.length,
    reviews: [...movie.reviews]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        id: r._id.toString(),
        userId: r.user.toString(),
        userName: r.userName,
        text: r.text,
        rating: ratingByUser.get(r.user.toString()) ?? null,
        createdAt: iso(r.createdAt),
        updatedAt: iso(r.updatedAt),
      })),
  };
}

export function serializeMovie(movie, viewer) {
  return {
    id: movie._id.toString(),
    directorId: movie.director.toString(),
    directorName: movie.directorName,
    title: movie.title,
    tagline: movie.tagline || undefined,
    synopsis: movie.synopsis || undefined,
    genres: movie.genres,
    languages: movie.languages,
    releaseDate: iso(movie.releaseDate),
    runtimeMinutes: movie.runtimeMinutes ?? undefined,
    certification: movie.certification || undefined,
    status: movie.status,
    cast: movie.cast.map((c) => ({ name: c.name, role: c.role || undefined })),
    team: (movie.team ?? []).map((t) => ({ role: t.role, name: t.name })),
    movieImage: movie.movieImage || undefined,
    trailerUrl: movie.trailerUrl || undefined,
    ratingRequestedAt: iso(movie.ratingRequestedAt),
    ratingRequestCount: movie.ratingRequestCount ?? (movie.ratingRequestedAt ? 1 : 0),
    /** When the director may ask for ratings again (24 hours after the last ask) */
    nextRatingRequestAt: movie.ratingRequestedAt
      ? iso(new Date(movie.ratingRequestedAt.getTime() + RATING_REQUEST_COOLDOWN_MS))
      : undefined,
    createdAt: iso(movie.createdAt),
    ...ratingSummary(movie, viewer),
  };
}

/**
 * Shape a Feed document for the client, including how near it is to the viewer.
 * `movieId` links a normal feed's film tag to the director's movie with that title.
 */
export function serializeFeed(feed, viewer, { movieId } = {}) {
  const near = proximity(viewer?.location, feed.location);
  const isRating = feed.type === "rating";
  const movie = isRating && feed.movie && feed.movie._id ? serializeMovie(feed.movie, viewer) : undefined;
  return {
    id: feed._id.toString(),
    type: feed.type ?? "update",
    directorId: feed.author.toString(),
    directorName: feed.authorName,
    filmTitle: movie?.title ?? (feed.filmTitle || undefined),
    movieId: movie?.id ?? movieId,
    text: feed.text,
    images: feed.images,
    movie,
    location: feed.location
      ? { city: feed.location.city, state: feed.location.state, country: feed.location.country }
      : undefined,
    createdAt: iso(feed.createdAt),
    editedAt: iso(feed.editedAt),
    likes: feed.likes.map((id) => id.toString()),
    comments: feed.comments.map((c) => ({
      id: c._id.toString(),
      userId: c.user.toString(),
      userName: c.userName,
      text: c.text,
      createdAt: iso(c.createdAt),
    })),
    proximity: near.label,
    distanceKm: near.distanceKm,
    _tier: near.tier,
  };
}
