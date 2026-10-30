import express, { Router, type Request, type Response } from "express";
import { defaultProfile, presets } from "../data/profile.js";
import { compareLimiter, memoryLimiter, planLimiter, searchLimiter, snapLimiter, tasteLimiter } from "../middleware/rateLimit.js";
import { parseBudget } from "../services/budget.js";
import { modelAloneChecked } from "../services/grounding.js";
import { modelLabel, models } from "../services/nemotron.js";
import { compareTastes, describeTaste } from "../services/tasteInsights.js";
import { writeMemory } from "../services/memory.js";
import { snapTaste } from "../services/snap.js";
import { planEvening, replanCategories } from "../services/planner.js";
import { QlooError, searchEntities, searchTags } from "../services/qloo.js";
import { CATEGORIES, QLOO_TYPES, type Category, type Feedback, type FeedbackItem, type MoodRead, type Named, type OnStep, type Plan, type PlanResponse, type TasteProfile } from "../types.js";

export const MAX_PROMPT_LENGTH = 300;
const MAX_BUDGET_CAD = 1000;

export class BadRequest extends Error {}

function readFeedbackItems(value: unknown): FeedbackItem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) throw new BadRequest("feedback lists must be arrays of at most 50 items");
  return value.map((v) => {
    if (
      !v ||
      typeof v.id !== "string" ||
      v.id.length > 120 ||
      typeof v.name !== "string" ||
      v.name.length > 200 ||
      !CATEGORIES.includes(v.category as Category)
    ) {
      throw new BadRequest("each feedback item needs id, name, and category");
    }
    return { id: v.id, name: v.name, category: v.category as Category };
  });
}

/** Optional explicit budget, used by the "Raise budget to $X" action instead of the prompt's `$N`. */
function readBudgetOverride(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_BUDGET_CAD) {
    throw new BadRequest("budgetCad must be a positive number");
  }
  return value;
}

const ENTITY_ID = /^[A-Za-z0-9-]{8,64}$/;
const TAG_ID = /^urn:tag:[A-Za-z0-9_:.&-]{1,150}$/;
const MAX_PER_LIST = 5;

function readNamedList(value: unknown, pattern: RegExp, what: string): Named[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_PER_LIST) throw new BadRequest(`${what} must be a list of at most ${MAX_PER_LIST}`);
  return value.map((v) => {
    if (!v || typeof v.id !== "string" || !pattern.test(v.id) || typeof v.name !== "string" || !v.name.trim() || v.name.length > 100) {
      throw new BadRequest(`${what} items need a Qloo id and a name`);
    }
    return { id: v.id, name: v.name.trim() };
  });
}

/** One or two taste profiles; with none, the cozy demo persona is used. */
function readProfiles(value: unknown): TasteProfile[] {
  if (value === undefined || value === null) return [defaultProfile()];
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) throw new BadRequest("profiles must contain one or two profiles");
  return value.map((p: any, i: number) => {
    if (!p || typeof p !== "object") throw new BadRequest("profile is malformed");
    // People are "You" and "Your partner" — no names needed; any name sent is ignored.
    const name = i === 0 ? "You" : "Your partner";
    const profile: TasteProfile = {
      name,
      likedMovies: readNamedList(p.likedMovies, ENTITY_ID, "likedMovies"),
      likedArtists: readNamedList(p.likedArtists, ENTITY_ID, "likedArtists"),
      likedFoods: readNamedList(p.likedFoods, TAG_ID, "likedFoods"),
      dislikedMovieTags: readNamedList(p.dislikedMovieTags, TAG_ID, "dislikedMovieTags"),
      dislikedPlaceTags: readNamedList(p.dislikedPlaceTags, TAG_ID, "dislikedPlaceTags"),
    };
    if (!profile.likedMovies.length && !profile.likedArtists.length && !profile.likedFoods.length) {
      throw new BadRequest(`${name}'s profile needs at least one liked movie, artist, or food`);
    }
    return profile;
  });
}

/** The browser's taste-memory notes (written earlier by /api/memory), sent back with plans. */
function readMemory(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 3 || value.some((v) => typeof v !== "string" || !v.trim() || v.length > 160)) {
    throw new BadRequest("memory must be up to 3 short notes");
  }
  return value.map((v: string) => v.trim());
}

export function readPlanBody(req: Request): { prompt: string; feedback: Feedback; budgetCad?: number; profiles: TasteProfile[]; memory: string[] } {
  const body = req.body ?? {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new BadRequest("prompt is required");
  if (prompt.length > MAX_PROMPT_LENGTH) throw new BadRequest(`prompt must be at most ${MAX_PROMPT_LENGTH} characters`);
  const fb = body.feedback ?? {};
  return {
    prompt,
    feedback: { liked: readFeedbackItems(fb.liked), disliked: readFeedbackItems(fb.disliked) },
    budgetCad: readBudgetOverride(body.budgetCad),
    profiles: readProfiles(body.profiles),
    memory: readMemory(body.memory),
  };
}

const isSlot = (v: any) => v && typeof v === "object" && typeof v.ok === "boolean";

/** The browser's current cards. They are echoed back unchanged for every category not being replaced. */
function readSnapshot(value: any): Plan {
  if (!value || typeof value !== "object" || !CATEGORIES.every((c) => isSlot(value[c]))) {
    throw new BadRequest("current must contain movie, dinner, and playlist slots");
  }
  return { movie: value.movie, dinner: value.dinner, playlist: value.playlist };
}

/** The first plan's mood reading, echoed back on re-plan so the evening's mood stays consistent. */
function readMood(value: any): MoodRead | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || !Array.isArray(value.tags) || value.tags.length > 9) throw new BadRequest("mood is malformed");
  const tags = value.tags.map((t: any) => {
    if (!t || typeof t.id !== "string" || !/^urn:tag:[A-Za-z0-9_:.&-]{1,150}$/.test(t.id) || typeof t.name !== "string" || t.name.length > 80 || !CATEGORIES.includes(t.category)) {
      throw new BadRequest("mood tags are malformed");
    }
    return { id: t.id, name: t.name, category: t.category as Category };
  });
  return { reading: typeof value.reading === "string" ? value.reading.slice(0, 60) : "", tags };
}

function readReplace(value: unknown): Category[] {
  if (!Array.isArray(value) || !value.length || value.some((v) => !CATEGORIES.includes(v as Category))) {
    throw new BadRequest("replace must list one or more of movie, dinner, playlist");
  }
  return [...new Set(value as Category[])];
}

/**
 * Runs a plan. If the browser asked for `application/x-ndjson`, each agent step is streamed as a line
 * (`{"type":"step",...}`) and the outcome arrives as the last line (`{"type":"result"|"error","status":...}`).
 * Otherwise it is a normal JSON response, exactly as before.
 */
async function runPlan(req: Request, res: Response, work: (onStep: OnStep) => Promise<PlanResponse>, emptyIsFailure: boolean) {
  const streaming = String(req.headers.accept ?? "").includes("application/x-ndjson");
  const finish = (status: number, body: unknown) => {
    if (!streaming) return void res.status(status).json(body);
    res.write(JSON.stringify(status < 400 ? { type: "result", status, body } : { type: "error", status, body }) + "\n");
    res.end();
  };
  if (streaming) {
    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
  }
  const onStep: OnStep = streaming ? (step) => void res.write(JSON.stringify({ type: "step", step }) + "\n") : () => {};
  try {
    const result = await work(onStep);
    // Nothing at all came back: that's the whole-request failure state, not three broken cards.
    if (emptyIsFailure && CATEGORIES.every((c) => !result.plan[c].ok)) return finish(502, { error: "taste_service_unavailable" });
    finish(200, result);
  } catch (err) {
    console.error(`[plan] ${err instanceof Error ? err.message : err}`);
    finish(502, { error: "taste_service_unavailable" });
  }
}

export const planRouter = Router();

/** The preset personas, with their resolved Qloo IDs, so the browser can show and send them. */
planRouter.get("/presets", (_req, res) => {
  res.json(presets);
});

/** Autocomplete for the taste builder: Qloo search for movies/artists, Qloo restaurant-genre tags for food. */
planRouter.get("/search", searchLimiter, async (req, res) => {
  const type = String(req.query.type ?? "");
  const q = String(req.query.q ?? "").trim();
  if (!["movie", "artist", "food"].includes(type) || q.length < 2 || q.length > 60) {
    return void res.status(400).json({ error: "bad_request", message: "type must be movie, artist, or food and q 2–60 characters" });
  }
  try {
    if (type === "food") {
      const tags = await searchTags(q, QLOO_TYPES.place, 25);
      const cuisines = tags.filter((t) => t.id.startsWith("urn:tag:genre:place:restaurant:")).slice(0, 8);
      return void res.json({ results: cuisines.map((t) => ({ id: t.id, name: t.name })) });
    }
    const found = await searchEntities(q, type === "movie" ? QLOO_TYPES.movie : QLOO_TYPES.artist, 8);
    res.json({ results: found.map((c) => ({ id: c.id, name: c.name, detail: c.year ? String(c.year) : undefined, image: c.image })) });
  } catch (err) {
    console.error(`[search] ${err instanceof QlooError ? err.message : err}`);
    res.status(502).json({ error: "taste_service_unavailable" });
  }
});

/** "In a few words" for each profile, plus where two tastes meet (Qloo taste analysis + compare). */
planRouter.post("/taste", tasteLimiter, async (req, res) => {
  let profiles: TasteProfile[];
  try {
    if (req.body?.profiles === undefined) throw new BadRequest("profiles are required");
    profiles = readProfiles(req.body.profiles);
  } catch (err) {
    if (err instanceof BadRequest) return void res.status(400).json({ error: "bad_request", message: err.message });
    throw err;
  }
  try {
    const [words, overlap] = await Promise.all([
      Promise.all(profiles.map((p) => describeTaste(p).then((w) => w.words).catch(() => [] as string[]))),
      profiles.length > 1 ? compareTastes(profiles[0], profiles[1]).catch(() => undefined) : Promise.resolve(undefined),
    ]);
    res.json({ words, overlap });
  } catch (err) {
    console.error(`[taste] ${err instanceof Error ? err.message : err}`);
    res.status(502).json({ error: "taste_service_unavailable" });
  }
});

/**
 * Live grounding check for one plan: the same prompt and taste(s) answered by the pick model with no Qloo
 * grounding, every suggestion then checked in Qloo. The grounded side is the plan already on screen.
 */
planRouter.post("/compare-alone", compareLimiter, async (req, res) => {
  let input;
  try {
    input = readPlanBody(req);
  } catch (err) {
    if (err instanceof BadRequest) return void res.status(400).json({ error: "bad_request", message: err.message });
    throw err;
  }
  const budgetCad = input.budgetCad ?? parseBudget(input.prompt).budgetCad;
  const t = Date.now();
  try {
    const modelAlone = await modelAloneChecked(input.prompt, input.profiles, budgetCad);
    res.json({ modelAlone, budgetCad, model: modelLabel(models().select), ms: Date.now() - t });
  } catch (err) {
    console.error(`[compare-alone] ${err instanceof Error ? err.message : err}`);
    res.status(502).json({ error: "taste_service_unavailable" });
  }
});

/** Taste memory: Nemotron Ultra (reasoning) summarises this browser's thumbs into ≤ 3 cited notes. Nothing is stored. */
planRouter.post("/memory", memoryLimiter, async (req, res) => {
  let liked: FeedbackItem[], disliked: FeedbackItem[];
  try {
    liked = readFeedbackItems(req.body?.liked);
    disliked = readFeedbackItems(req.body?.disliked);
  } catch (err) {
    if (err instanceof BadRequest) return void res.status(400).json({ error: "bad_request", message: err.message });
    throw err;
  }
  if (liked.length + disliked.length < 3) return void res.status(400).json({ error: "bad_request", message: "need at least 3 thumbs" });
  try {
    res.json(await writeMemory(liked, disliked));
  } catch (err) {
    console.error(`[memory] ${err instanceof Error ? err.message : err}`);
    res.status(502).json({ error: "taste_service_unavailable" });
  }
});

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Snap your taste: a photo (data URL, ≤ 4 MB) → Nemotron Super VL → Qloo matches. The image is not stored. */
planRouter.post("/snap", snapLimiter, express.json({ limit: "6mb" }), async (req, res) => {
  const image = typeof req.body?.image === "string" ? req.body.image : "";
  const m = image.match(DATA_URL);
  if (!m) return void res.status(400).json({ error: "bad_request", message: "image must be a JPEG, PNG, or WebP data URL" });
  if (Math.floor((m[2].length * 3) / 4) > MAX_IMAGE_BYTES) return void res.status(413).json({ error: "too_large", message: "image must be 4 MB or smaller" });
  try {
    res.json(await snapTaste(image));
  } catch (err) {
    console.error(`[snap] ${err instanceof Error ? err.message : err}`);
    res.status(502).json({ error: "taste_service_unavailable" });
  }
});

planRouter.post("/plan", planLimiter, async (req, res) => {
  let input;
  try {
    input = readPlanBody(req);
  } catch (err) {
    if (err instanceof BadRequest) return void res.status(400).json({ error: "bad_request", message: err.message });
    throw err;
  }
  const { prompt, profiles, feedback, budgetCad, memory } = input;
  await runPlan(req, res, (onStep) => planEvening(prompt, profiles, feedback, budgetCad, onStep, memory), true);
});

planRouter.post("/replan", planLimiter, async (req, res) => {
  let input, replace, current, mood;
  try {
    input = readPlanBody(req);
    replace = readReplace(req.body?.replace);
    current = readSnapshot(req.body?.current);
    mood = readMood(req.body?.mood);
  } catch (err) {
    if (err instanceof BadRequest) return void res.status(400).json({ error: "bad_request", message: err.message });
    throw err;
  }
  const excludeShown = req.body?.excludeShown !== false;
  const { prompt, profiles, feedback, budgetCad, memory } = input;
  await runPlan(req, res, (onStep) => replanCategories(prompt, profiles, feedback, replace!, current!, budgetCad, excludeShown, mood, onStep, memory), false);
});
