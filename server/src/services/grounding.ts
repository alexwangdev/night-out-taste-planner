import { PRICE_LEVEL_CAD } from "./budget.js";
import { models, nemotronRequest } from "./nemotron.js";
import { scoreFor } from "./planner.js";
import { qlooGet } from "./qloo.js";
import type { Category, TasteProfile } from "../types.js";

/**
 * "Nemotron alone" vs grounded: ask the pick model for an evening with no Qloo grounding, then check every
 * suggestion in Qloo — does it exist (places: in Toronto), is it marked closed, does Qloo's price level fit
 * the budget, is it one of the person's own favourites, and how well does Qloo say it matches their taste
 * (two people: the lower of their two scores). Shared by `npm run eval` and the live "Compare" button.
 */

const TORONTO = "43.6532,-79.3832";

export const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/\(\d{4}\)/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\bthe\b/g, "").trim();

function describe(p: TasteProfile, partner = false) {
  const dislikes = [...p.dislikedMovieTags, ...p.dislikedPlaceTags].map((d) => d.name);
  const likes = [...p.likedMovies, ...p.likedArtists, ...p.likedFoods].map((x) => x.name).join(", ");
  return partner
    ? `My partner loves ${likes}${dislikes.length ? `; they dislike ${dislikes.join(", ")}` : ""}`
    : `I love ${likes}${dislikes.length ? `; I dislike ${dislikes.join(", ")}` : ""}`;
}

const answerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["movie", "restaurants", "artists"],
  properties: {
    movie: { type: "string" },
    restaurants: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "object", additionalProperties: false, required: ["name", "estimated_cost_cad"], properties: { name: { type: "string" }, estimated_cost_cad: { type: "number" } } },
    },
    artists: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
  },
};

/** The pick model's answer with no grounding: one movie, three Toronto restaurants (with a cost), three artists. */
export async function modelAloneAnswer(prompt: string, people: TasteProfile[]): Promise<{ movie: string; restaurants: { name: string; estimated_cost_cad: number }[]; artists: string[] }> {
  const who = people.length > 1 ? `We are two people. ${describe(people[0])}. ${describe(people[1], true)}.` : `${describe(people[0])}.`;
  const r = await nemotronRequest(
    {
      temperature: 0.6,
      max_tokens: 800,
      response_format: { type: "json_schema", json_schema: { name: "evening", schema: answerSchema, strict: true } },
      messages: [
        {
          role: "user",
          content: `${who} Request: "${prompt}" in Toronto. Dinner budget is per person in CAD before tip. Suggest one movie to stream, three real Toronto restaurants that fit the budget with an estimated cost per person, and three music artists for a playlist. Reply with JSON only.`,
        },
      ],
    },
    { model: models().select, timeoutMs: 45_000 },
  );
  return JSON.parse(r.choices[0].message.content);
}

export interface Check {
  /** True when the suggestion is one of the person's own stated favourites (no discovery). */
  echo?: boolean;
  name: string;
  verified: boolean;
  matchedName?: string;
  id?: string;
  closed?: boolean;
  claimedCostCad?: number;
  qlooEstimateCad?: number;
  fitsBudget?: boolean;
  tasteMatch?: number;
}

export async function lookup(name: string, kind: "movie" | "place" | "artist"): Promise<Check> {
  const params: Record<string, string | number> = { query: name, types: `urn:entity:${kind}`, take: 8 };
  if (kind === "place") Object.assign(params, { "filter.location": TORONTO, "filter.radius": 25 });
  const body = await qlooGet("/search", params);
  const list: any[] = Array.isArray(body?.results) ? body.results : body?.results?.entities ?? [];
  const q = norm(name);
  const same = list.filter((e) => {
    const n = norm(String(e.name ?? ""));
    // Prefix matches count too ("Glass Onion: A Knives Out Mystery" is "Glass Onion" in Qloo), so the model isn't penalised for long titles.
    return n === q || ((n.startsWith(q) || q.startsWith(n)) && Math.min(n.length, q.length) >= 4);
  });
  if (!same.length) return { name, verified: false };
  const open = same.find((e) => e.properties?.is_closed !== true);
  const pick = open ?? same[0];
  const level = Number(pick.properties?.price_level);
  return {
    name,
    verified: true,
    matchedName: pick.name,
    id: pick.entity_id ?? pick.id,
    closed: kind === "place" ? !open : undefined,
    qlooEstimateCad: Number.isInteger(level) ? PRICE_LEVEL_CAD[level] : undefined,
  };
}

/** Qloo's taste match for these IDs: one person's score, or the lower of two people's. */
async function tasteMatch(category: Category, people: TasteProfile[], ids: string[]): Promise<Map<string, number>> {
  const per = await Promise.all(people.map((p) => scoreFor(category, p, { liked: [], disliked: [] }, ids).catch(() => new Map<string, number>())));
  const out = new Map<string, number>();
  for (const id of ids) {
    const scores = per.map((m) => m.get(id));
    if (scores.every((x) => x !== undefined)) out.set(id, Math.min(...(scores as number[])));
  }
  return out;
}

/** Mark suggestions that just repeat a favourite the person already gave. */
function markEchoes(checks: Check[], people: TasteProfile[]) {
  const liked = people.flatMap((p) => [...p.likedMovies, ...p.likedArtists]);
  const ids = new Set(liked.map((x) => x.id));
  const names = new Set(liked.map((x) => norm(x.name)));
  for (const c of checks) c.echo = (c.id !== undefined && ids.has(c.id)) || names.has(norm(c.name)) || (c.matchedName !== undefined && names.has(norm(c.matchedName)));
}

async function scoreChecks(checks: Check[], category: Category, people: TasteProfile[]) {
  const ids = checks.filter((c) => c.id).map((c) => c.id!);
  const m = await tasteMatch(category, people, ids);
  for (const c of checks) if (c.id) c.tasteMatch = m.get(c.id);
}

export interface ModelAloneChecked {
  movie: Check;
  restaurants: Check[];
  artists: Check[];
}

/** Ask the model alone, then check every suggestion against Qloo (one lookup at a time — the key is rate limited). */
export async function modelAloneChecked(prompt: string, people: TasteProfile[], budgetCad: number): Promise<ModelAloneChecked> {
  const a = await modelAloneAnswer(prompt, people);
  const movie = await lookup(a.movie, "movie");
  const restaurants: Check[] = [];
  for (const r of a.restaurants) {
    const c = await lookup(r.name, "place");
    c.claimedCostCad = r.estimated_cost_cad;
    c.fitsBudget = c.qlooEstimateCad !== undefined ? c.qlooEstimateCad <= budgetCad : undefined;
    restaurants.push(c);
  }
  const artists: Check[] = [];
  for (const n of a.artists) artists.push(await lookup(n, "artist"));
  markEchoes([movie, ...artists], people);
  await Promise.all([scoreChecks([movie], "movie", people), scoreChecks(restaurants, "dinner", people), scoreChecks(artists, "playlist", people)]);
  return { movie, restaurants, artists };
}
