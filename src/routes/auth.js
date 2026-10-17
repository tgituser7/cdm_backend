import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { parseLocation } from "../utils/location.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^[+\d][\d\s-]{6,18}$/;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/** Start a fresh session for the user (new id prevents session fixation). */
function startSession(req, user, remember) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      // "Remember me" keeps the cookie for 30 days; otherwise it ends with the browser session.
      req.session.cookie.maxAge = remember ? THIRTY_DAYS : null;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

router.post("/signup", authLimiter, async (req, res) => {
  const { name, email, password, role, mobile, bio, location } = req.body ?? {};
  const errors = {};

  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (cleanName.length < 2) errors.name = "Enter your full name";
  if (!EMAIL_RE.test(cleanEmail)) errors.email = "Enter a valid email address";
  if (typeof password !== "string" || password.length < 8) errors.password = "Password must be at least 8 characters";
  if (!["audience", "director"].includes(role)) errors.role = "Choose Audience or Director";
  if (mobile && !MOBILE_RE.test(String(mobile).trim())) errors.mobile = "Enter a valid mobile number";

  let loc;
  if (location && (location.city || location.lat !== undefined)) {
    const parsed = parseLocation(location, { requireCity: false });
    if (parsed.error) errors.location = parsed.error;
    else loc = parsed.value;
  }

  if (Object.keys(errors).length) return res.status(400).json({ error: "Please fix the highlighted fields", fields: errors });

  if (await User.exists({ email: cleanEmail })) {
    return res.status(409).json({ error: "An account with this email already exists", fields: { email: "Already registered — try signing in" } });
  }

  const user = await User.create({
    name: cleanName,
    email: cleanEmail,
    passwordHash: await bcrypt.hash(password, 12),
    role,
    mobile: mobile ? String(mobile).trim() : undefined,
    bio: role === "director" && typeof bio === "string" ? bio.trim().slice(0, 300) : undefined,
    location: loc,
  });

  await startSession(req, user, true);
  res.status(201).json({ user });
});

router.post("/login", authLimiter, async (req, res) => {
  const { email, password, remember } = req.body ?? {};
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  const user = cleanEmail ? await User.findOne({ email: cleanEmail }).select("+passwordHash") : null;
  const ok = user && typeof password === "string" && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) return res.status(401).json({ error: "Incorrect email or password" });

  await startSession(req, user, remember !== false);
  res.json({ user });
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("cdm.sid");
    res.json({ ok: true });
  });
});

router.get("/me", (req, res) => {
  res.json({ user: req.user ?? null });
});

router.patch("/me/location", requireAuth, async (req, res) => {
  const parsed = parseLocation(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  req.user.location = parsed.value;
  await req.user.save();
  res.json({ user: req.user });
});

export default router;
