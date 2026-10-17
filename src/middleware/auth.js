import { User } from "../models/User.js";

/** Attach the signed-in user (if any) to req.user. */
export async function loadUser(req, _res, next) {
  const userId = req.session?.userId;
  if (userId) {
    req.user = await User.findById(userId);
    if (!req.user) delete req.session.userId;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in to continue" });
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Please sign in to continue" });
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Only ${role === "director" ? "directors" : "audience members"} can do that` });
    }
    next();
  };
}
