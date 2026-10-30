import type { Named } from "../types.js";
import { QLOO_TYPES } from "../types.js";
import { modelLabel, models, nemotronRequest } from "./nemotron.js";
import { searchEntities, searchTags } from "./qloo.js";

/**
 * "Snap your taste": Nemotron 3.5 Super VL reads a photo (shelf, record sleeves, a watch-history or playlist
 * screenshot, a meal) and lists what it sees; each item is then matched to a real Qloo entity or tag.
 * Nothing is stored. Reasoning is on: with it off, the model missed every title printed sideways on spines.
 */

const MAX_PER_KIND = 5;

const PROMPT = `Read this photo the way a friend would when guessing someone's taste. It may show a shelf, record sleeves, posters, a phone screenshot of a watch history or playlist, or food. Read ALL visible text, including text rotated sideways on book/DVD spines. Return the movies or TV shows, music artists (artist names, not album titles), and foods or cuisines it shows. Use exact titles and names as printed; only include things actually visible.`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["movies", "artists", "foods"],
  properties: {
    movies: { type: "array", items: { type: "string", maxLength: 80 }, maxItems: MAX_PER_KIND },
    artists: { type: "array", items: { type: "string", maxLength: 80 }, maxItems: MAX_PER_KIND },
    foods: { type: "array", items: { type: "string", maxLength: 40 }, maxItems: MAX_PER_KIND },
  },
};

export interface SnapMatch extends Named {
  /** What the model read in the photo. */
  seen: string;
  detail?: string;
  image?: string;
}

export interface SnapResult {
  movies: SnapMatch[];
  artists: SnapMatch[];
  foods: SnapMatch[];
  /** Things read in the photo that Qloo had no match for. */
  unmatched: string[];
  model: string;
  ms: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const clean = (xs: unknown) =>
  [...new Set((Array.isArray(xs) ? xs : []).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, MAX_PER_KIND);

export async function snapTaste(dataUrl: string): Promise<SnapResult> {
  const t = Date.now();
  const model = models().vision;
  const body = await nemotronRequest(
    {
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: "json_schema", json_schema: { name: "taste_photo", schema, strict: true } },
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }],
    },
    { model, thinking: true, timeoutMs: 45_000 },
  );
  const raw = body.choices[0].message.content;
  const start = typeof raw === "string" ? raw.indexOf("{") : -1;
  const read = start >= 0 ? JSON.parse(raw.slice(start, raw.lastIndexOf("}") + 1)) : {};
  const seen = { movies: clean(read.movies), artists: clean(read.artists), foods: clean(read.foods) };

  // Match each item to Qloo, one request at a time (the key is rate limited).
  const unmatched: string[] = [];
  const out: Omit<SnapResult, "model" | "ms" | "unmatched"> = { movies: [], artists: [], foods: [] };
  for (const [kind, type] of [["movies", QLOO_TYPES.movie], ["artists", QLOO_TYPES.artist]] as const) {
    for (const name of seen[kind]) {
      const hits = await searchEntities(name, type, 5).catch(() => []);
      const best = hits.find((h) => norm(h.name) === norm(name)) ?? hits[0];
      if (best && !out[kind].some((m) => m.id === best.id)) {
        out[kind].push({ id: best.id, name: best.name, seen: name, detail: best.year ? String(best.year) : undefined, image: best.image });
      } else if (!best) unmatched.push(name);
    }
  }
  for (const food of seen.foods) {
    const tags = await searchTags(food, QLOO_TYPES.place, 25).catch(() => []);
    const cuisines = tags.filter((t) => t.id.startsWith("urn:tag:genre:place:restaurant:"));
    const best = cuisines.find((c) => norm(c.name) === norm(food)) ?? cuisines[0];
    if (best && !out.foods.some((m) => m.id === best.id)) out.foods.push({ id: best.id, name: best.name, seen: food });
    else if (!best) unmatched.push(food);
  }
  return { ...out, unmatched, model: modelLabel(model), ms: Date.now() - t };
}
