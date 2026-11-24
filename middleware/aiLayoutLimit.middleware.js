import httpStatus from "http-status";
import AppError from "../errors/AppError.js";

// Per-user limit on AI layout runs. The Cloudflare Workers AI free tier gives
// a daily neuron budget shared by every user, so one user re-running the
// layout over and over could use it up for everyone.
//
// Settings (.env):
//   AI_LAYOUT_LIMIT       runs allowed per user per window (default 15)
//   AI_LAYOUT_WINDOW_MIN  window length in minutes (default 60)
//
// Counts are kept in memory: they reset on restart and are per process,
// which is fine for a single server.

const LIMIT = Number(process.env.AI_LAYOUT_LIMIT) || 15;
const WINDOW_MS = (Number(process.env.AI_LAYOUT_WINDOW_MIN) || 60) * 60 * 1000;

const runs = new Map(); // userId -> [timestamps]

export const aiLayoutLimit = (req, res, next) => {
  const userId = String(req.user?._id ?? req.ip);
  const now = Date.now();
  const recent = (runs.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= LIMIT) {
    runs.set(userId, recent);
    const retryMin = Math.ceil((recent[0] + WINDOW_MS - now) / 60000);
    res.set("Retry-After", String(retryMin * 60));
    return next(
      new AppError(
        httpStatus.TOO_MANY_REQUESTS,
        `AI layout limit reached (${LIMIT} per ${WINDOW_MS / 60000} min). Try again in ${retryMin} min.`
      )
    );
  }

  recent.push(now);
  runs.set(userId, recent);
  next();
};

// Drop users with no recent runs so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [id, times] of runs) {
    if (!times.some((t) => now - t < WINDOW_MS)) runs.delete(id);
  }
}, WINDOW_MS).unref();
