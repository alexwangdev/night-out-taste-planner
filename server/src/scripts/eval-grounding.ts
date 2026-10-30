/**
 * Grounding scoreboard: the same evening requests answered two ways —
 *   A) Nemotron alone (the same model the app uses for picks), asked for a movie, three Toronto restaurants
 *      with an estimated cost, and three artists;
 *   B) Cozy Night Planner (Qloo-grounded).
 * Every model-only suggestion is looked up in Qloo: does it exist (places: in Toronto), is it marked closed,
 * does Qloo's price level put it within the budget, and how well does Qloo say it matches the person's taste
 * (two people: the lower of their two scores)? Writes client/public/grounding.json for the #/grounding page.
 * Run from server/: npm run eval   (RUNS=2 by default)
 */
import { writeFileSync } from "node:fs";
import { presets } from "../data/profile.js";
import { PRICE_LEVEL_CAD } from "../services/budget.js";
import { modelLabel, models, nemotronRequest } from "../services/nemotron.js";
import { planEvening, scoreFor } from "../services/planner.js";
import { qlooGet } from "../services/qloo.js";
import type { Category, TasteProfile } from "../types.js";

const RUNS = Number(process.env.RUNS ?? 2);
const TORONTO = "43.6532,-79.3832";

const alex: TasteProfile = {
  name: "You",
  likedMovies: [{ id: "E12149D8-3108-4019-8881-3F932AB67D38", name: "Knives Out" }],
  likedArtists: [{ id: "70CAE5BF-2F4C-445C-A3E5-4EDACFC3591C", name: "Radiohead" }],
  likedFoods: [{ id: "urn:tag:genre:place:restaurant:korean", name: "Korean" }],
  dislikedMovieTags: [],
  dislikedPlaceTags: [],
};

const scenarios: { title: string; prompt: string; people: TasteProfile[]; budget: number }[] = [
  { title: "Cozy Friday (cozy demo taste)", prompt: "Plan my Friday night, something cozy, under $60 CAD", people: [presets.cozy], budget: 60 },
  { title: "Rainy romantic Sunday (cozy demo taste)", prompt: "A rainy Sunday date night, something romantic, $40 CAD", people: [presets.cozy], budget: 40 },
  { title: "Fun night (Knives Out, Radiohead, Korean)", prompt: "Plan my Saturday night, something fun, under $50 CAD", people: [alex], budget: 50 },
  { title: "Date night for two (cozy taste + demo partner)", prompt: "Date night on Saturday, something fun but cozy, $60 CAD", people: [presets.cozy, presets.partner], budget: 60 },
];

const norm = (s: string) =>
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

async function modelAlone(s: (typeof scenarios)[number]) {
  const who = s.people.length > 1 ? `We are two people. ${describe(s.people[0])}. ${describe(s.people[1], true)}.` : `${describe(s.people[0])}.`;
  const r = await nemotronRequest(
    {
      temperature: 0.6,
      max_tokens: 800,
      response_format: { type: "json_schema", json_schema: { name: "evening", schema: answerSchema, strict: true } },
      messages: [
        {
          role: "user",
          content: `${who} Request: "${s.prompt}" in Toronto. Dinner budget is per person in CAD before tip. Suggest one movie to stream, three real Toronto restaurants that fit the budget with an estimated cost per person, and three music artists for a playlist. Reply with JSON only.`,
        },
      ],
    },
    { model: models().select },
  );
  return JSON.parse(r.choices[0].message.content);
}

interface Check {
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

async function lookup(name: string, kind: "movie" | "place" | "artist"): Promise<Check> {
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

const avg = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};

async function main() {
  const out: any[] = [];
  for (const s of scenarios) {
    console.log(`\n== ${s.title}`);
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const a = await modelAlone(s);
      const movie = await lookup(a.movie, "movie");
      const restaurants: Check[] = [];
      for (const r of a.restaurants) {
        const c = await lookup(r.name, "place");
        c.claimedCostCad = r.estimated_cost_cad;
        c.fitsBudget = c.qlooEstimateCad !== undefined ? c.qlooEstimateCad <= s.budget : undefined;
        restaurants.push(c);
      }
      const artists: Check[] = [];
      for (const n of a.artists) artists.push(await lookup(n, "artist"));
      markEchoes([movie, ...artists], s.people);
      await scoreChecks([movie], "movie", s.people);
      await scoreChecks(restaurants, "dinner", s.people);
      await scoreChecks(artists, "playlist", s.people);
      runs.push({ movie, restaurants, artists });
      console.log(
        `  model alone #${i + 1}: ${[movie, ...restaurants, ...artists].map((c) => `${c.name}${c.verified ? "" : " ✗"}${c.echo ? " (echo)" : ""}${c.closed ? " (closed)" : ""}${c.tasteMatch !== undefined ? ` ${Math.round(c.tasteMatch * 100)}%` : ""}`).join(", ")}`,
      );
    }
    const g = await planEvening(s.prompt, s.people, { liked: [], disliked: [] });
    const two = (x: any) => (x?.matches?.length > 1 ? Math.min(...x.matches.map((m: any) => m.affinity ?? 0)) : x?.affinity);
    const grounded = {
      movie: g.plan.movie.ok ? { name: g.plan.movie.card.name, tasteMatch: two(g.plan.movie.card) } : null,
      dinner: g.plan.dinner.ok
        ? { name: g.plan.dinner.card.name, tasteMatch: two(g.plan.dinner.card), qlooEstimateCad: g.plan.dinner.card.estimatedCostCad, fitsBudget: !g.plan.dinner.card.overBudget }
        : null,
      artists: g.plan.playlist.ok ? g.plan.playlist.card.artists.map((a) => ({ name: a.name, tasteMatch: two(a) })) : [],
    };
    console.log(`  grounded: ${[grounded.movie, grounded.dinner, ...grounded.artists].map((x: any) => `${x?.name} ${Math.round((x?.tasteMatch ?? 0) * 100)}%`).join(", ")}`);
    out.push({ title: s.title, prompt: s.prompt, people: s.people.map((p) => p.name), budgetCad: s.budget, modelAlone: runs, grounded });
  }

  // Summary, recomputed from the rows above.
  const all = out.flatMap((s) => s.modelAlone.flatMap((r: any) => [r.movie, ...r.restaurants, ...r.artists]));
  const places = out.flatMap((s) => s.modelAlone.flatMap((r: any) => r.restaurants));
  const groundedItems = out.flatMap((s) => [s.grounded.movie, s.grounded.dinner, ...s.grounded.artists].filter(Boolean));
  const summary = {
    modelAlone: {
      suggestions: all.length,
      verifiedInQloo: all.filter((c: Check) => c.verified).length,
      moviesAndArtists: all.length - places.length,
      echoes: all.filter((c: Check) => c.echo).length,
      restaurants: places.length,
      restaurantsFoundInToronto: places.filter((c: Check) => c.verified).length,
      restaurantsMarkedClosed: places.filter((c: Check) => c.closed).length,
      restaurantsWithinBudgetByQloo: places.filter((c: Check) => c.fitsBudget === true).length,
      restaurantsWithQlooPrice: places.filter((c: Check) => c.fitsBudget !== undefined).length,
      avgTasteMatch: avg(all.map((c: Check) => c.tasteMatch)),
    },
    grounded: {
      suggestions: groundedItems.length,
      verifiedInQloo: groundedItems.length,
      echoes: out.reduce((n, s) => {
        const liked = new Set(s.people.flatMap((name: string) => scenarios.find((x) => x.title === s.title)!.people.filter((p) => p.name === name).flatMap((p) => [...p.likedMovies, ...p.likedArtists].map((x) => norm(x.name)))));
        return n + [s.grounded.movie, ...s.grounded.artists].filter((x: any) => x && liked.has(norm(x.name))).length;
      }, 0),
      dinners: out.length,
      dinnersWithinBudget: out.filter((s) => s.grounded.dinner?.fitsBudget).length,
      avgTasteMatch: avg(groundedItems.map((x: any) => x.tasteMatch)),
    },
  };
  const report = {
    generatedAt: new Date().toISOString(),
    model: modelLabel(models().select),
    runsPerScenario: RUNS,
    method:
      "Model alone: the app's pick model is asked for one movie, three Toronto restaurants with an estimated cost, and three artists for the same request and taste. Each suggestion is looked up with Qloo search (places within 25 miles of downtown Toronto, matched by name). Taste match is Qloo's affinity of the matched entity to the person's favourites (two people: the lower of the two). Grounded: Cozy Night Planner's own plan for the same request; all picks come from Qloo, so they are verified by construction.",
    summary,
    scenarios: out,
  };
  writeFileSync(new URL("../../../client/public/grounding.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  console.log("\nSUMMARY", JSON.stringify(summary, null, 1));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
