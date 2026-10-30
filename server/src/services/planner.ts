import { CITY } from "../data/profile.js";
import type { Candidate, Category, Feedback, FeedbackItem, MoodRead, OnStep, PersonMatch, Plan, PlanResponse, TasteProfile } from "../types.js";
import { QLOO_TYPES } from "../types.js";
import { estimatedCostCad, filterDinner, parseBudget } from "./budget.js";
import { readMood } from "./moodAgent.js";
import { modelLabel, models, selectAndExplain } from "./nemotron.js";
import { getInsights } from "./qloo.js";
import { compareTastes } from "./tasteInsights.js";
import { nameHotspot, scoreAt, tasteMap, type TasteMap } from "./tasteMap.js";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const noop: OnStep = () => {};
const LABEL: Record<Category, string> = { movie: "movies", dinner: "Toronto restaurants", playlist: "artists" };
const pct = (a?: number) => (a === undefined ? "" : ` ${Math.round(a * 100)}%`);

/** Runs `fn` as a visible step: "running" first, then "done"/"warn" with a detail and timing. */
async function step<T>(onStep: OnStep, id: string, label: string, model: string | undefined, fn: () => Promise<T>, detail: (r: T) => string | { text: string; warn?: boolean }): Promise<T> {
  const t = Date.now();
  onStep({ id, label, status: "running", model });
  try {
    const r = await fn();
    const d = detail(r);
    const { text, warn } = typeof d === "string" ? { text: d, warn: false } : d;
    onStep({ id, label, status: warn ? "warn" : "done", detail: text, model, ms: Date.now() - t });
    return r;
  } catch (err) {
    onStep({ id, label, status: "warn", detail: "didn't come back — this part will show a retry", model, ms: Date.now() - t });
    throw err;
  }
}
const uniq = (xs: string[]) => [...new Set(xs)];

/** Mood-steered Insights calls get a shorter leash, then fall back to taste alone. */
const MOOD_TIMEOUT_MS = 8_000;

function describe(p: TasteProfile, label: string): string {
  const dislikes = [...p.dislikedMovieTags, ...p.dislikedPlaceTags].map((d) => d.name);
  return [
    `${label}:`,
    `  Liked movies: ${p.likedMovies.map((x) => x.name).join(", ") || "none given"}`,
    `  Liked music: ${p.likedArtists.map((x) => x.name).join(", ") || "none given"}`,
    `  Liked food: ${p.likedFoods.map((x) => x.name).join(", ") || "none given"}`,
    ...(dislikes.length ? [`  Dislikes: ${dislikes.join(", ")}`] : []),
  ].join("\n");
}

function tasteSummary(profiles: TasteProfile[], feedback: Feedback): string {
  const lines = profiles.length === 1 ? [describe(profiles[0], "The person (\"you\")")] : [describe(profiles[0], "You (the person planning)"), describe(profiles[1], "Your partner")];
  if (feedback.liked.length) lines.push(`Recently thumbs-up: ${feedback.liked.map((f) => f.name).join(", ")}`);
  const disliked = feedback.disliked.map((f) => f.name).filter(Boolean);
  if (disliked.length) lines.push(`Recently thumbs-down: ${disliked.join(", ")}`);
  return lines.join("\n");
}

function citeable(profiles: TasteProfile[], feedback: Feedback): Record<Category, string[]> {
  const liked = (cat: Category) => feedback.liked.filter((f) => f.category === cat).map((f) => f.name);
  // On date night each like is labelled with whose it is, so reasons don't credit one person's taste to the other.
  const owner = (i: number) => (profiles.length > 1 ? (i === 0 ? " (yours)" : " (your partner's)") : "");
  const all = <K extends "likedMovies" | "likedArtists" | "likedFoods">(k: K) => uniq(profiles.flatMap((p, i) => p[k].map((x) => `${x.name}${owner(i)}`)));
  return {
    movie: [...all("likedMovies"), ...liked("movie")],
    dinner: [...all("likedFoods"), ...liked("dinner")],
    playlist: [...all("likedArtists"), ...liked("playlist")],
  };
}

/** One person's Qloo candidate pool for one category. Everyone's dislikes are excluded. */
async function fetchFor(
  category: Category,
  person: TasteProfile,
  everyone: TasteProfile[],
  feedback: Feedback,
  moodTagIds: string[],
): Promise<Candidate[]> {
  const liked = uniq([...ids(person.likedMovies), ...ids(person.likedArtists), ...ids(feedback.liked)]);
  const disliked = ids(feedback.disliked);
  const timeoutMs = moodTagIds.length ? MOOD_TIMEOUT_MS : undefined;
  switch (category) {
    case "movie":
      return getInsights({
        type: QLOO_TYPES.movie,
        likedEntityIds: liked,
        likedTagIds: moodTagIds,
        excludeEntityIds: uniq([...everyone.flatMap((p) => ids(p.likedMovies)), ...disliked]),
        excludeTagIds: uniq(everyone.flatMap((p) => ids(p.dislikedMovieTags))),
        take: 15,
        timeoutMs,
      });
    case "dinner": {
      // Places must fit at least one person's cuisines; ranking follows this person's taste.
      const anyFood = uniq(everyone.flatMap((p) => ids(p.likedFoods)));
      return getInsights({
        type: QLOO_TYPES.place,
        likedEntityIds: liked,
        likedTagIds: uniq([...ids(person.likedFoods), ...moodTagIds]),
        requireAnyTagIds: anyFood,
        excludeEntityIds: disliked,
        excludeTagIds: uniq(everyone.flatMap((p) => ids(p.dislikedPlaceTags))),
        locationQuery: CITY,
        take: 25,
        timeoutMs,
      });
    }
    case "playlist":
      return getInsights({
        type: QLOO_TYPES.artist,
        likedEntityIds: liked,
        likedTagIds: moodTagIds,
        excludeEntityIds: uniq([...everyone.flatMap((p) => ids(p.likedArtists)), ...disliked]),
        take: 15,
        timeoutMs,
      });
  }
}

/** After this long without a mood-steered answer, a plain taste-only request starts alongside it. */
const HEDGE_AFTER_MS = 2_500;

interface Fetched {
  found: Candidate[];
  /** False when the mood-steered request was too slow or failed and taste alone was used. */
  moodUsed: boolean;
}

/**
 * Mood-steered Qloo calls are sometimes slow. Hedge: if one hasn't answered after 3 s, start a
 * taste-only request too and use whichever succeeds first (mood wins if it lands first).
 */
async function fetchWithMoodFallback(category: Category, person: TasteProfile, everyone: TasteProfile[], feedback: Feedback, moodTagIds: string[]): Promise<Fetched> {
  if (!moodTagIds.length) return { found: await fetchFor(category, person, everyone, feedback, []), moodUsed: false };
  return new Promise<Fetched>((resolve, reject) => {
    let settled = false;
    let failures = 0;
    let plainStarted = false;
    let lastErr: unknown;
    const win = (r: Fetched) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(r);
      }
    };
    const lose = (err: unknown) => {
      lastErr = err;
      if (++failures >= (plainStarted ? 2 : 1) && plainStarted) {
        if (!settled) {
          settled = true;
          reject(lastErr);
        }
      } else if (!plainStarted) startPlain();
    };
    const startPlain = () => {
      if (plainStarted || settled) return;
      plainStarted = true;
      fetchFor(category, person, everyone, feedback, []).then((found) => win({ found, moodUsed: false }), lose);
    };
    const timer = setTimeout(startPlain, HEDGE_AFTER_MS);
    fetchFor(category, person, everyone, feedback, moodTagIds).then((found) => win({ found, moodUsed: true }), (err) => {
      console.warn(`[planner] ${category} with mood tags failed (${err instanceof Error ? err.message : err}); using taste alone`);
      lose(err);
    });
  });
}

const TYPE_OF: Record<Category, (typeof QLOO_TYPES)[keyof typeof QLOO_TYPES]> = {
  movie: QLOO_TYPES.movie,
  dinner: QLOO_TYPES.place,
  playlist: QLOO_TYPES.artist,
};

/** How much one person's taste likes each of the given entities, straight from Qloo (filter.results.entities). */
export async function scoreFor(category: Category, person: TasteProfile, feedback: Feedback, entityIds: string[]): Promise<Map<string, number>> {
  if (!entityIds.length) return new Map();
  const found = await getInsights({
    type: TYPE_OF[category],
    likedEntityIds: uniq([...ids(person.likedMovies), ...ids(person.likedArtists), ...ids(feedback.liked)]),
    likedTagIds: category === "dinner" ? ids(person.likedFoods) : undefined,
    onlyEntityIds: entityIds,
    take: entityIds.length,
  });
  return new Map(found.filter((c) => c.affinity !== undefined).map((c) => [c.id, c.affinity!]));
}

/** "For both" means Qloo rates the pick at least this well for each person. */
const BOTH_THRESHOLD = 0.8;

/**
 * Two people: gather each person's Qloo candidates, then ask Qloo how much *each* person likes
 * *every* candidate, and rank by the lower of the two scores so neither person carries the evening.
 */
async function blendForTwo(category: Category, profiles: TasteProfile[], feedback: Feedback, moodTagIds: string[], onStep: OnStep = noop): Promise<Candidate[] & { moodUsed: boolean }> {
  const fetched = await Promise.all(profiles.map((p) => fetchWithMoodFallback(category, p, profiles, feedback, moodTagIds)));
  const pools = fetched.map((f) => f.found);
  const moodUsed = fetched.every((f) => f.moodUsed);
  const union = new Map<string, Candidate>();
  for (const pool of pools) for (const c of pool) if (!union.has(c.id)) union.set(c.id, c);
  const known = pools.map((pool) => new Map(pool.filter((c) => c.affinity !== undefined).map((c) => [c.id, c.affinity!])));
  // Fill in each person's score for candidates that came from the other person's list.
  const extra = await Promise.all(
    profiles.map((p, i) =>
      scoreFor(category, p, feedback, [...union.keys()].filter((id) => !known[i].has(id))).catch((err) => {
        console.warn(`[planner] ${category} scoring for ${p.name} failed: ${err instanceof Error ? err.message : err}`);
        return new Map<string, number>();
      }),
    ),
  );
  const missing = profiles.reduce((n, _p, i) => n + [...union.keys()].filter((id) => !known[i].has(id)).length, 0);
  const blended = [...union.values()].map((c) => {
    const matches: PersonMatch[] = profiles.map((p, i) => ({ name: p.name, affinity: known[i].get(c.id) ?? extra[i].get(c.id) }));
    const scores = matches.map((m) => m.affinity ?? 0);
    const low = Math.min(...scores);
    return { ...c, matches, affinity: low, forBoth: matches.every((m) => m.affinity !== undefined) && low >= BOTH_THRESHOLD };
  });
  const ranked = Object.assign(blended.sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0)).slice(0, category === "dinner" ? 30 : 15), { moodUsed });
  const both = ranked.filter((c) => c.forBoth).length;
  onStep({
    id: `blend-${category}`,
    label: `Scoring ${LABEL[category]} for both of you`,
    status: "done",
    detail: `${union.size} candidates, ${missing} cross-scored by Qloo → ${both} rated ≥80% for both${ranked[0] ? `; top: ${ranked[0].name}` : ""}`,
  });
  return ranked;
}

async function fetchCategory(category: Category, profiles: TasteProfile[], feedback: Feedback, moodTagIds: string[], onStep: OnStep = noop): Promise<Candidate[]> {
  const r = await step(
    onStep,
    `qloo-${category}`,
    `Asking Qloo for ${LABEL[category]}${profiles.length > 1 ? " for each of you" : ""}${moodTagIds.length ? " with your mood tags" : ""}`,
    undefined,
    async (): Promise<Fetched> => {
      if (profiles.length === 1) return fetchWithMoodFallback(category, profiles[0], profiles, feedback, moodTagIds);
      const found = await blendForTwo(category, profiles, feedback, moodTagIds, onStep);
      return { found, moodUsed: found.moodUsed };
    },
    ({ found, moodUsed }) => {
      if (!found.length) return { text: "no candidates came back", warn: true };
      const text = `${found.length} candidates; top: ${found[0].name}${pct(found[0].affinity)}`;
      return moodTagIds.length && !moodUsed ? { text: `${text} (mood-tag request was slow — used taste alone)`, warn: true } : text;
    },
  );
  return r.found;
}

const failed = { ok: false as const, error: "retry" as const };

/**
 * Builds the requested categories: mood agent → Qloo candidates (per person) → CAD budget filter →
 * Nemotron choose/explain → validated cards. A category that can't be filled honestly becomes a retry slot.
 */
export async function planCategories(
  prompt: string,
  profiles: TasteProfile[],
  feedback: Feedback,
  categories: Category[],
  budgetOverride?: number,
  knownMood?: MoodRead,
  onStep: OnStep = noop,
  memory: string[] = [],
): Promise<{
  plan: Partial<Plan>;
  budgetCad: number;
  budgetAssumed: boolean;
  mood: MoodRead;
  models: PlanResponse["models"];
  overlap?: PlanResponse["overlap"];
  area?: PlanResponse["area"];
}> {
  const parsed = parseBudget(prompt);
  const budgetCad = budgetOverride ?? parsed.budgetCad;
  const assumed = budgetOverride === undefined && parsed.assumed;
  const pools: Partial<Record<Category, Candidate[]>> = {};
  let dinnerOverBudget = false;

  // The agent turns the request's mood into Qloo tags (re-plans reuse the first plan's reading).
  const mood = knownMood
    ? (onStep({ id: "mood", label: "Keeping the same mood", status: "done", detail: knownMood.reading || "taste only" }), knownMood)
    : await step(onStep, "mood", "Reading your mood and searching Qloo's tags", modelLabel(models().mood), () => readMood(prompt), (m) =>
        m.tags.length
          ? `“${m.reading}” · searched ${(m.searches ?? []).slice(0, 6).join(", ")} → ${[...new Set(m.tags.map((t) => t.name))].join(", ")}`
          : { text: "no mood tags — planning from taste alone", warn: true },
      );
  const moodIds = (cat: Category) => mood.tags.filter((t) => t.category === cat).map((t) => t.id);
  const matches = (cat: Category, c?: Candidate) => {
    if (!c) return [];
    const have = new Set(c.tagIds);
    return mood.tags.filter((t) => t.category === cat && have.has(t.id)).map((t) => t.name);
  };

  // Alongside the candidates: where two tastes meet (Qloo compare) and the Toronto taste map (Qloo heatmap).
  const overlapP =
    profiles.length > 1
      ? step(onStep, "overlap", "Comparing your two tastes with Qloo", undefined, () => compareTastes(profiles[0], profiles[1]), (o) =>
          o.shared.length ? `you meet on ${o.shared.map((x) => x.name).join(", ")}` : { text: "no shared themes found", warn: true },
        ).catch(() => undefined)
      : Promise.resolve(undefined);
  const mapP: Promise<TasteMap | null> = categories.includes("dinner")
    ? step(onStep, "map", `Mapping where in ${CITY} your taste lives`, undefined, () => tasteMap(profiles, CITY), (m) =>
        m ? `${m.bins.length} areas scored${profiles.length > 1 ? " (the lower of your two scores)" : ""}` : { text: "no map data", warn: true },
      ).catch(() => null)
    : Promise.resolve(null);

  // Categories are fetched together; qlooGet backs off if Qloo rate-limits.
  const fetched = await Promise.all(
    categories.map((cat) =>
      fetchCategory(cat, profiles, feedback, moodIds(cat), onStep).catch((err) => {
        console.warn(`[planner] ${cat} candidates failed: ${err instanceof Error ? err.message : err}`);
        return null;
      }),
    ),
  );
  const [overlap, map] = await Promise.all([overlapP, mapP]);
  let hotspot: string | undefined;
  categories.forEach((cat, i) => {
    const found = fetched[i];
    if (!found) return;
    if (cat === "dinner") {
      if (map) {
        for (const c of found) c.areaScore = scoreAt(map, c.lat, c.lon);
        hotspot = nameHotspot(map, found);
      }
      const pool = filterDinner(found, budgetCad);
      const priced = found.filter((c) => estimatedCostCad(c) !== undefined).length;
      onStep({
        id: "budget",
        label: `Applying your $${budgetCad} CAD dinner budget${assumed ? " (assumed)" : ""}`,
        status: pool && !pool.overBudget ? "done" : "warn",
        detail: !pool
          ? `none of ${found.length} places has a Qloo price level`
          : pool.overBudget
            ? `nothing priced fits — closest is ${pool.candidates[0].name} at ~$${estimatedCostCad(pool.candidates[0])}`
            : `${pool.candidates.length} of ${priced} priced places fit (unpriced places skipped)`,
      });
      if (pool) {
        pools.dinner = pool.candidates;
        dinnerOverBudget = pool.overBudget;
      }
    } else if (found.length) {
      pools[cat] = found;
    }
  });

  let selection: Awaited<ReturnType<typeof selectAndExplain>> = {};
  if (Object.keys(pools).length) {
    const t = Date.now();
    onStep({ id: "select", label: profiles.length > 1 ? "Choosing an evening you'll both enjoy" : "Choosing your evening", status: "running", model: modelLabel(models().select) });
    try {
      selection = await selectAndExplain({
        prompt,
        tasteSummary: tasteSummary(profiles, feedback),
        candidates: pools,
        budgetCad,
        dinnerOverBudget,
        citeable: citeable(profiles, feedback),
        moodLine: mood.tags.length ? `${mood.reading} (Qloo tags: ${mood.tags.map((t) => `${t.category}: ${t.name}`).join("; ")})` : "",
        people: profiles.map((p) => p.name),
        memory,
        overlapLine: overlap?.shared.length
          ? `you meet on ${overlap.shared.map((x) => x.name).join(", ")}; you lean ${overlap.youLean.join(", ") || "—"}; your partner leans ${overlap.partnerLeans.join(", ") || "—"}`
          : undefined,
        hotspot,
      });
      const fellBack = selection.model && selection.model !== models().select;
      onStep({
        id: "select",
        label: profiles.length > 1 ? "Choosing an evening you'll both enjoy" : "Choosing your evening",
        status: fellBack ? "warn" : "done",
        model: selection.model ? modelLabel(selection.model) : modelLabel(models().select),
        detail: fellBack ? `primary model unavailable — picked by ${modelLabel(selection.model!)}` : "picks and one-line reasons written",
        ms: Date.now() - t,
      });
    } catch (err) {
      console.warn(`[planner] selection failed: ${err instanceof Error ? err.message : err}`);
      onStep({ id: "select", label: "Choosing your evening", status: "warn", detail: "the model didn't answer — try again", ms: Date.now() - t });
    }
  }

  const details = (cat: Category, c: Candidate) => ({
    affinity: c.affinity,
    image: c.image,
    links: c.links,
    moodMatches: matches(cat, c),
    ...(profiles.length > 1 ? { matches: c.matches ?? [], forBoth: !!c.forBoth } : {}),
  });

  const plan: Partial<Plan> = {};
  for (const cat of categories) {
    const pool = pools[cat] ?? [];
    const byId = new Map(pool.map((c) => [c.id, c]));
    if (cat === "movie") {
      const c = selection.movie && byId.get(selection.movie.id);
      plan.movie = c ? { ok: true, card: { id: c.id, name: c.name, year: c.year, reason: selection.movie!.reason, ...details(cat, c) } } : failed;
    } else if (cat === "dinner") {
      const c = selection.dinner && byId.get(selection.dinner.id);
      const cost = c && estimatedCostCad(c);
      plan.dinner =
        c && cost !== undefined
          ? {
              ok: true,
              card: {
                id: c.id,
                name: c.name,
                address: c.address,
                neighborhood: c.neighborhood,
                rating: c.rating,
                areaScore: c.areaScore,
                ...details(cat, c),
                priceLevel: c.priceLevel!,
                estimatedCostCad: cost,
                budgetCad,
                overBudget: cost > budgetCad,
                reason: selection.dinner!.reason,
              },
            }
          : failed;
    } else {
      const s = selection.playlist;
      const artists = s ? s.artistIds.map((id) => byId.get(id)).filter((a): a is Candidate => !!a) : [];
      const scored = artists.filter((a) => a.affinity !== undefined);
      const affinity = scored.length ? scored.reduce((sum, a) => sum + a.affinity!, 0) / scored.length : undefined;
      plan.playlist =
        s && artists.length
          ? {
              ok: true,
              card: {
                title: s.title,
                artists: artists.map((a) => ({
                  id: a.id,
                  name: a.name,
                  image: a.image,
                  affinity: a.affinity,
                  links: a.links,
                  ...(profiles.length > 1 ? { matches: a.matches ?? [], forBoth: !!a.forBoth } : {}),
                })),
                affinity,
                moodMatches: [...new Set(artists.flatMap((a) => matches("playlist", a)))],
                reason: s.reason,
              },
            }
          : failed;
    }
  }
  const checked = categories.filter((c) => (pools[c]?.length ?? 0) > 0);
  const verified = checked.filter((c) => plan[c]?.ok).length;
  onStep({
    id: "verify",
    label: "Checking every pick against Qloo's candidates",
    status: verified === checked.length ? "done" : "warn",
    detail: `${verified} of ${checked.length} picks verified; anything the model invented would be rejected`,
  });
  const dinnerPick = plan.dinner?.ok ? pools.dinner?.find((c) => c.id === (plan.dinner as any).card.id) : undefined;
  const area: PlanResponse["area"] = map
    ? {
        name: hotspot,
        bins: map.bins,
        best: map.best,
        pick:
          dinnerPick?.lat !== undefined && dinnerPick.lon !== undefined
            ? { lat: dinnerPick.lat, lon: dinnerPick.lon, name: dinnerPick.name, score: dinnerPick.areaScore ?? 0 }
            : undefined,
      }
    : undefined;
  return {
    plan,
    budgetCad,
    budgetAssumed: assumed,
    mood,
    models: { mood: knownMood ? undefined : mood.model, selection: selection.model },
    overlap,
    area,
  };
}

export async function planEvening(prompt: string, profiles: TasteProfile[], feedback: Feedback, budgetOverride?: number, onStep: OnStep = noop, memory: string[] = []): Promise<PlanResponse> {
  if (memory.length) onStep({ id: "memory", label: "Using what I've learned from your thumbs", status: "done", detail: memory.join(" · ") });
  const r = await planCategories(prompt, profiles, feedback, ["movie", "dinner", "playlist"], budgetOverride, undefined, onStep, memory);
  return { ...r, plan: r.plan as Plan };
}

/** IDs currently shown in a slot, so a replacement can never be the same pick again. */
function shownIds(plan: Plan, cat: Category): string[] {
  const slot = plan[cat];
  if (!slot.ok) return [];
  const card: any = slot.card;
  return cat === "playlist" ? (card.artists ?? []).map((a: any) => a?.id).filter((id: unknown) => typeof id === "string") : [card.id];
}

/**
 * Re-plan: only the listed categories go to Qloo and Nemotron. Every other slot in the browser's
 * snapshot is returned exactly as it was sent, so liked and untouched cards never change.
 */
export async function replanCategories(
  prompt: string,
  profiles: TasteProfile[],
  feedback: Feedback,
  replace: Category[],
  current: Plan,
  budgetOverride?: number,
  excludeShown = true,
  knownMood?: MoodRead,
  onStep: OnStep = noop,
  memory: string[] = [],
): Promise<PlanResponse> {
  if (memory.length) onStep({ id: "memory", label: "Using what I've learned from your thumbs", status: "done", detail: memory.join(" · ") });
  // Raising the budget isn't a dislike: the place on screen stays eligible at the new budget.
  const outgoing: FeedbackItem[] = !excludeShown ? [] : replace.flatMap((cat) => shownIds(current, cat).map((id) => ({ id, name: "", category: cat })));
  const known = new Set(feedback.disliked.map((d) => d.id));
  const withExclusions: Feedback = {
    liked: feedback.liked,
    disliked: [...feedback.disliked, ...outgoing.filter((o) => !known.has(o.id))],
  };
  const fresh = await planCategories(prompt, profiles, withExclusions, replace, budgetOverride, knownMood, onStep, memory);
  const plan: Plan = { ...current };
  for (const cat of replace) (plan as any)[cat] = fresh.plan[cat];
  return { ...fresh, plan };
}
