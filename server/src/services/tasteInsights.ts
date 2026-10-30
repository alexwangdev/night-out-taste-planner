import type { TasteProfile } from "../types.js";
import { models, nemotronRequest } from "./nemotron.js";
import { qlooGet } from "./qloo.js";

/**
 * Qloo taste analysis for profiles:
 *  - "In a few words": the style tags (and top music genre) Qloo says best describe a profile (filter.type=urn:tag).
 *  - "Where your tastes meet": Qloo's /v2/analysis/compare between two profiles — shared themes, with the
 *    favourites on each side that support them, plus each side's own leanings.
 * Results are cached in memory per profile, since profiles rarely change between plans.
 */

export interface TasteWords {
  words: string[];
}

export interface SharedTheme {
  name: string;
  /** Favourites on each side that Qloo says support this shared theme. */
  you: string[];
  partner: string[];
}

export interface Overlap {
  shared: SharedTheme[];
  youLean: string[];
  partnerLeans: string[];
}

/** Tag families that read well as human descriptions (regions, instruments, audiences and music theory don't). */
const READABLE = /^urn:tag:(style:qloo|theme:qloo|genre:media|genre:qloo|plot:qloo|subgenre:qloo|genre:music|music:qloo|keyword:qloo)/;

const entityIds = (p: TasteProfile) => [...p.likedMovies, ...p.likedArtists].map((x) => x.id);
const key = (p: TasteProfile) => [...entityIds(p), ...p.likedFoods.map((f) => f.id)].sort().join(",");
const tidy = (s: string) => s.trim().replace(/[,;]+$/, "").replace(/\s+/g, " ");

/**
 * Qloo proposes, Nemotron picks: choose the `n` candidate tags that a person would recognise as describing
 * the context. The reply schema is an enum of the candidates, so only Qloo's own tags can come back.
 * Falls back to the first `n` candidates (Qloo's popularity order) if the model is unavailable.
 */
async function pickBest(candidates: string[], context: string, n: number): Promise<string[]> {
  const list = [...new Set(candidates)].slice(0, 20);
  if (list.length <= n) return list;
  try {
    const body = await nemotronRequest(
      {
        temperature: 0.2,
        max_tokens: 200,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "pick",
            strict: true,
            schema: { type: "object", additionalProperties: false, required: ["picks"], properties: { picks: { type: "array", items: { type: "string", enum: list }, minItems: 1, maxItems: n } } },
          },
        },
        messages: [
          {
            role: "user",
            content: `${context}\nFrom these taste-graph tags, pick the ${n} that a friend would most recognise as describing this — skip odd, overly literal, or misleading ones:\n${list.map((c) => `- ${c}`).join("\n")}\nReply with JSON only.`,
          },
        ],
      },
      { model: models().mood, timeoutMs: 15_000 },
    );
    const raw = body.choices[0].message.content;
    const picks: unknown = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)).picks;
    const ok = Array.isArray(picks) ? [...new Set(picks.filter((p): p is string => typeof p === "string" && list.includes(p)))] : [];
    return ok.length ? ok.slice(0, n) : list.slice(0, n);
  } catch {
    return list.slice(0, n);
  }
}

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(k: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.value as T;
  const value = await fn();
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  cache.set(k, { at: Date.now(), value });
  return value;
}

/** A few words that describe one profile's taste: Qloo's top style tags, its top music genre, and its foods. */
export function describeTaste(p: TasteProfile): Promise<TasteWords> {
  return cached(`words:${key(p)}`, async () => {
    const ids = entityIds(p);
    const words: string[] = [];
    if (ids.length) {
      const [styles, music] = await Promise.all([
        qlooGet("/v2/insights/", { "filter.type": "urn:tag", "signal.interests.entities": ids.join(","), "filter.tag.types": "urn:tag:style:qloo", take: 15 }).catch(() => null),
        p.likedArtists.length
          ? qlooGet("/v2/insights/", { "filter.type": "urn:tag", "signal.interests.entities": ids.join(","), "filter.tag.types": "urn:tag:genre:music", take: 1 }).catch(() => null)
          : Promise.resolve(null),
      ]);
      // Most widely used style tags first, then let the model keep the three that fit best.
      const styleNames = [...(styles?.results?.tags ?? [])]
        .sort((x: any, y: any) => (y?.popularity ?? 0) - (x?.popularity ?? 0))
        .map((t: any) => (typeof t?.name === "string" ? tidy(t.name) : ""))
        .filter(Boolean);
      const favs = [...p.likedMovies, ...p.likedArtists].map((x) => x.name).join(", ");
      words.push(...(await pickBest(styleNames, `Someone's favourites: ${favs}.`, 3)));
      const genre = music?.results?.tags?.[0]?.name;
      if (typeof genre === "string") words.push(tidy(genre));
    }
    for (const f of p.likedFoods.slice(0, 2)) words.push(f.name);
    return { words: [...new Map(words.filter(Boolean).map((w) => [w.toLowerCase(), w])).values()].slice(0, 5) };
  });
}

/** Where two tastes meet and where they part, from Qloo's compare analysis. */
export function compareTastes(a: TasteProfile, b: TasteProfile): Promise<Overlap> {
  return cached(`compare:${key(a)}|${key(b)}`, async () => {
    const body = await qlooGet("/v2/analysis/compare", {
      "a.signal.interests.entities": entityIds(a).join(","),
      "b.signal.interests.entities": entityIds(b).join(","),
      take: 40,
    });
    const names = (xs: any) => [...new Set((Array.isArray(xs) ? xs : []).map((e: any) => e?.name).filter((n: unknown): n is string => typeof n === "string"))];
    // All readable shared themes Qloo found, with the favourites behind them on each side.
    const pool = new Map<string, SharedTheme>();
    for (const t of body?.results?.tags ?? []) {
      const name = typeof t?.name === "string" ? tidy(t.name) : "";
      if (!name || !READABLE.test(String(t.tag_id)) || pool.has(name.toLowerCase())) continue;
      pool.set(name.toLowerCase(), { name, you: names(t.query?.["a.signal.interests.entities"]), partner: names(t.query?.["b.signal.interests.entities"]) });
    }
    const favs = (p: TasteProfile) => [...p.likedMovies, ...p.likedArtists].map((x) => x.name).join(", ");
    const chosen = await pickBest(
      [...pool.values()].map((s) => s.name),
      `Two people planning a date night. One loves ${favs(a)}; the other loves ${favs(b)}. These are themes Qloo found in both tastes.`,
      4,
    );
    const shared = chosen.map((c) => pool.get(c.toLowerCase())!).filter(Boolean);
    const seen = new Set(shared.map((s) => s.name.toLowerCase()));
    // Each side's own leanings: its readable tags that the other side doesn't share.
    const side = (xs: any, other: any) => {
      const otherIds = new Set((Array.isArray(other) ? other : []).map((t: any) => t?.tag_id));
      const out: string[] = [];
      for (const t of Array.isArray(xs) ? xs : []) {
        const name = typeof t?.name === "string" ? tidy(t.name) : "";
        if (name && READABLE.test(String(t.tag_id)) && !otherIds.has(t.tag_id) && !seen.has(name.toLowerCase()) && !out.includes(name)) out.push(name);
        if (out.length >= 3) break;
      }
      return out;
    };
    return { shared, youLean: side(body?.results?.a, body?.results?.b), partnerLeans: side(body?.results?.b, body?.results?.a) };
  });
}
