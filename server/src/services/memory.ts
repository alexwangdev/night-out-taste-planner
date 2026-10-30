import type { FeedbackItem } from "../types.js";
import { modelLabel, models, nemotronRequest } from "./nemotron.js";

/**
 * Taste memory: Nemotron 3 Ultra (reasoning on — this runs in the background, so latency doesn't matter)
 * reads what this browser has thumbed up and down and writes up to three short notes about the pattern.
 * Each note must cite the items it is based on; notes citing anything else are dropped.
 * Nothing is stored on the server — the browser keeps the notes and sends them with later plans.
 */

export interface MemoryNote {
  text: string;
  basedOn: string[];
}

export interface MemoryResult {
  notes: MemoryNote[];
  model: string;
  ms: number;
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["notes"],
  properties: {
    notes: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "basedOn"],
        properties: {
          text: { type: "string", maxLength: 140 },
          basedOn: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
        },
      },
    },
  },
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

export async function writeMemory(liked: FeedbackItem[], disliked: FeedbackItem[]): Promise<MemoryResult> {
  const t = Date.now();
  const model = models().memory;
  const list = (xs: FeedbackItem[]) => (xs.length ? xs.map((x) => `- ${x.name} (${x.category === "playlist" ? "artist" : x.category})`).join("\n") : "- none");
  const body = await nemotronRequest(
    {
      temperature: 0.3,
      max_tokens: 6000,
      response_format: { type: "json_schema", json_schema: { name: "taste_memory", schema, strict: true } },
      messages: [
        {
          role: "system",
          content:
            "You keep a short taste memory for an evening-planning app. From the person's thumbs-up and thumbs-down, write at most 3 notes (max 20 words each) about patterns that would help plan their next evening — what they lean toward and what to avoid. Address them as \"you\". Only state patterns at least two items support — a general lean (genres, moods, styles, kinds of places), not a single name; with little evidence, write fewer notes or none. Never invent facts about the items. For each note, list in basedOn the exact item names it rests on (at least two), copied from the lists.",
        },
        { role: "user", content: `Thumbs up:\n${list(liked)}\n\nThumbs down:\n${list(disliked)}` },
      ],
    },
    { model, thinking: true, timeoutMs: 90_000 },
  );
  const raw = body.choices[0].message.content;
  const start = typeof raw === "string" ? raw.indexOf("{") : -1;
  const parsed = start >= 0 ? JSON.parse(raw.slice(start, raw.lastIndexOf("}") + 1)) : { notes: [] };
  const known = new Map([...liked, ...disliked].map((x) => [norm(x.name), x.name]));
  const notes: MemoryNote[] = [];
  for (const n of Array.isArray(parsed.notes) ? parsed.notes : []) {
    const text = typeof n?.text === "string" ? n.text.trim().replace(/\s+/g, " ").slice(0, 140) : "";
    const cited = Array.isArray(n?.basedOn) ? n.basedOn.filter((b: unknown): b is string => typeof b === "string") : [];
    const resolved = cited.map((b: string) => known.get(norm(b)));
    // Keep a note only if it cites at least two real items and nothing that isn't in the lists.
    const unique = [...new Set(resolved.filter(Boolean) as string[])];
    if (text && resolved.every(Boolean) && unique.length >= 2) notes.push({ text, basedOn: unique });
  }
  return { notes: notes.slice(0, 3), model: modelLabel(model), ms: Date.now() - t };
}
