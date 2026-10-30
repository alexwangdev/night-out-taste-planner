import type { Category, MoodRead, MoodTag } from "../types.js";
import { CATEGORIES, QLOO_TYPES } from "../types.js";
import { models, nemotronRequest } from "./nemotron.js";
import { searchTags } from "./qloo.js";

/**
 * The mood agent: Nemotron reads the request and searches Qloo's tag graph through a tool,
 * then chooses the tags that should steer each category's Insights request.
 * Only tag IDs that Qloo actually returned to a search can be used.
 */

const PARENT: Record<Category, string> = { movie: QLOO_TYPES.movie, dinner: QLOO_TYPES.place, playlist: QLOO_TYPES.artist };
const MAX_SEARCHES = 8;
const MAX_TAGS_PER_CATEGORY = 3;
/** Tags actually sent to Insights per category: more made Qloo much slower without better picks. */
const MAX_SIGNAL_TAGS = 2;
/**
 * Measured on the hackathon host: genre tags as Insights signals were slow (movies 7–10 s, artists ~8.6 s vs ~3 s
 * without) and either skewed results (movie "Romantic" → Bollywood) or changed nothing; style/keyword/plot tags
 * are fast and do shift the picks.
 */
const UNHELPFUL: Partial<Record<Category, RegExp>> = { movie: /^urn:tag:genre:media:/, playlist: /^urn:tag:genre:music:/ };

// Tag searches repeat a lot ("cozy", "romantic"); keep a small in-process cache.
const tagCache = new Map<string, MoodTag[]>();
async function cachedTagSearch(query: string, category: Category): Promise<MoodTag[]> {
  const key = `${category}:${query.toLowerCase().trim()}`;
  const hit = tagCache.get(key);
  if (hit) return hit;
  const found = (await searchTags(query, PARENT[category] as any, 8)).map((t) => ({ id: t.id, name: t.name, category }));
  if (tagCache.size > 300) tagCache.delete(tagCache.keys().next().value!);
  tagCache.set(key, found);
  return found;
}

const SEARCH_TOOL = {
  type: "function",
  function: {
    name: "search_qloo_tags",
    description:
      "Search Qloo's taste graph for tags that describe a mood, setting, style, or food for one category of the evening. Use short queries: one idea, 1–2 words.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "One short idea, e.g. 'cozy', 'rainy day', 'romantic', 'comfort food', 'acoustic'." },
        category: { type: "string", enum: CATEGORIES },
      },
      required: ["query", "category"],
    },
  },
};

const SYSTEM = `You are the mood reader for Cozy Night Planner, which plans a movie, a dinner spot, and a playlist.
Turn the person's request into Qloo taste-graph tags.
Step 1: call search_qloo_tags for the request's mood ideas, covering movie, dinner, and playlist (about 2 searches each, at most ${MAX_SEARCHES} in total). Use short, single-idea queries such as "cozy", "rainy day", "romantic", "comfort food", "acoustic", "funny", "nostalgic". Translate the mood for each category (a rainy night might be "rainy day" for music, "comfort food" for dinner, "heartwarming" for a movie).
Ignore budget, day, and city words. Never search for specific titles or names.`;

const choiceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reading", "movie", "dinner", "playlist"],
  properties: {
    reading: { type: "string", maxLength: 60 },
    movie: { type: "array", items: { type: "string" }, maxItems: MAX_TAGS_PER_CATEGORY },
    dinner: { type: "array", items: { type: "string" }, maxItems: MAX_TAGS_PER_CATEGORY },
    playlist: { type: "array", items: { type: "string" }, maxItems: MAX_TAGS_PER_CATEGORY },
  },
};

const STOP = new Set(["the", "and", "with", "for", "night", "evening", "something", "very", "some", "plan", "friday", "saturday", "sunday", "dinner", "movie", "music"]);

const EMPTY: MoodRead = { reading: "", tags: [] };

export async function readMood(prompt: string): Promise<MoodRead> {
  const messages: any[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Request: "${prompt}"` },
  ];
  try {
    // Turn 1: the model decides what to search for.
    const model = models().mood;
    const first = await nemotronRequest({ messages, tools: [SEARCH_TOOL], tool_choice: "auto", temperature: 0.3, max_tokens: 600 }, { model });
    const msg = first.choices[0].message;
    const calls: any[] = Array.isArray(msg.tool_calls) ? msg.tool_calls.slice(0, MAX_SEARCHES) : [];
    if (!calls.length) return EMPTY;

    // Run the searches against Qloo (one at a time; the key is rate limited).
    const seen = new Map<string, MoodTag>();
    const searches: string[] = [];
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const call of calls) {
      let args: any = {};
      try {
        args = JSON.parse(call.function?.arguments ?? "{}");
      } catch {
        args = {};
      }
      const category = CATEGORIES.includes(args.category) ? (args.category as Category) : null;
      const query = typeof args.query === "string" ? args.query.slice(0, 40) : "";
      if (query.trim()) searches.push(query.trim());
      let found: MoodTag[] = [];
      if (category && query.trim()) {
        try {
          found = await cachedTagSearch(query, category);
          // A multi-idea phrase ("fun and upbeat") often has no tag; fall back to its separate words.
          if (!found.length) {
            const words = query.split(/,|\band\b|\bor\b|\s+/i).map((w: string) => w.trim()).filter((w: string) => w.length > 2 && !STOP.has(w.toLowerCase()));
            for (const w of words.slice(0, 2)) found.push(...(await cachedTagSearch(w, category)));
          }
        } catch (err) {
          console.warn(`[mood] tag search "${query}" failed: ${err instanceof Error ? err.message : err}`);
        }
      }
      for (const t of found) seen.set(`${t.category}|${t.id}`, t);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: found.length ? found.map((t) => `${t.id} | ${t.name}`).join("\n") : "no tags found",
      });
    }
    if (!seen.size) return EMPTY;

    // Turn 2: the model picks tags it actually saw, per category.
    messages.push({
      role: "user",
      content: `Now choose up to ${MAX_TAGS_PER_CATEGORY} tag ids per category that best capture the request, copied exactly from the search results for that category, plus a short "reading" of the night in plain words (max 8 words, e.g. "rainy, romantic, slow and warm"). Reply with JSON only.`,
    });
    const second = await nemotronRequest({
      messages,
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_schema", json_schema: { name: "mood_tags", schema: choiceSchema, strict: true } },
    }, { model });
    const raw = second.choices[0].message.content;
    const start = typeof raw === "string" ? raw.indexOf("{") : -1;
    const parsed = start >= 0 ? JSON.parse(raw.slice(start, raw.lastIndexOf("}") + 1)) : null;
    if (!parsed) return EMPTY;

    const tags: MoodTag[] = [];
    for (const cat of CATEGORIES) {
      const ids: unknown[] = Array.isArray(parsed[cat]) ? parsed[cat] : [];
      let kept = 0;
      for (const id of [...new Set(ids)].slice(0, MAX_TAGS_PER_CATEGORY)) {
        const tag = typeof id === "string" ? seen.get(`${cat}|${id}`) : undefined;
        if (!tag || UNHELPFUL[cat]?.test(tag.id)) continue; // anything the model invented is dropped here
        if (kept++ < MAX_SIGNAL_TAGS) tags.push(tag);
      }
    }
    const reading = typeof parsed.reading === "string" ? parsed.reading.trim().replace(/\s+/g, " ").slice(0, 60) : "";
    return { reading: tags.length ? reading : "", tags, model, searches: [...new Set(searches)] };
  } catch (err) {
    console.warn(`[mood] agent failed, planning without mood tags: ${err instanceof Error ? err.message : err}`);
    return EMPTY;
  }
}
