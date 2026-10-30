import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

/**
 * One shared window for POST /api/plan and /api/replan: 10 requests per client IP per 60 s.
 * In-memory store: best-effort for a single Render instance; resets when the process restarts or sleeps.
 * /health is not behind this limiter so it can always wake Render.
 */
export const planLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  // req.ip is the real client once `trust proxy` matches Render's hops (see index.ts).
  // ipKeyGenerator groups an IPv6 client's /56 so it can't dodge the limit by rotating addresses.
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
  handler: (_req, res) => {
    res.status(429).json({ error: "rate_limited" });
  },
});

/** Taste memory refreshes after feedback; a few per minute is plenty. */
export const memoryLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
  handler: (_req, res) => {
    res.status(429).json({ error: "rate_limited" });
  },
});

/** Taste words / overlap for profile chips: called when profiles change. */
export const tasteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
  handler: (_req, res) => {
    res.status(429).json({ error: "rate_limited" });
  },
});

/** Photo uploads run a vision model: keep them scarce. */
export const snapLimiter = rateLimit({
  windowMs: 60_000,
  limit: 6,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
  handler: (_req, res) => {
    res.status(429).json({ error: "rate_limited" });
  },
});

/** Autocomplete for building a taste profile: typing fires many small Qloo searches. */
export const searchLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
  handler: (_req, res) => {
    res.status(429).json({ error: "rate_limited" });
  },
});
