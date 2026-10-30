import type { Candidate, Category } from "../types.js";
import { estimatedCostCad } from "./budget.js";

const BASE_URL = "https://api.tokenfactory.nebius.com/v1";
const TIMEOUT_MS = 60_000;

export class NemotronError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NemotronError";
  }
}

/**
 * Which NVIDIA model runs each step, from the measured benchmark in devpost/model-benchmark.md.
 * Each is overridable by env var; NEBIUS_MODEL (older config) still sets the fallback.
 */
export function models() {
  const env = (k: string) => process.env[k]?.trim() || undefined;
  return {
    mood: env("NEMOTRON_MOOD_MODEL") ?? "nvidia/Nemotron-3_5-Lightning",
    select: env("NEMOTRON_SELECT_MODEL") ?? "nvidia/Nemotron-3-Ultra-550b-a55b",
    fallback: env("NEMOTRON_FALLBACK_MODEL") ?? env("NEBIUS_MODEL") ?? "nvidia/Nemotron-3_5-Lightning",
    vision: env("NEMOTRON_VISION_MODEL") ?? "nvidia/Nemotron-3.5-Super-VL",
    memory: env("NEMOTRON_MEMORY_MODEL") ?? "nvidia/Nemotron-3-Ultra-550b-a55b",
  };
}

/** Short display name, e.g. "Nemotron 3 Ultra". */
export function modelLabel(id: string): string {
  if (/ultra/i.test(id)) return "Nemotron 3 Ultra";
  if (/super-vl|super_vl|super-?vl/i.test(id)) return "Nemotron 3.5 Super VL";
  if (/super/i.test(id)) return "Nemotron 3 Super";
  if (/nano/i.test(id)) return "Nemotron 3 Nano";
  if (/lightning/i.test(id)) return "Nemotron 3.5 Lightning";
  return id.replace(/^nvidia\//, "");
}

export interface CallOptions {
  model: string;
  /** Reasoning mode; off for live steps (see benchmark), on only off the critical path. */
  thinking?: boolean;
  timeoutMs?: number;
}

/** One Token Factory chat-completions call. */
export async function nemotronRequest(body: Record<string, unknown>, opts: CallOptions = { model: models().fallback }): Promise<any> {
  const key = process.env.NEBIUS_API_KEY?.trim();
  if (!key) throw new NemotronError("NEBIUS_API_KEY is not set");
  const model = opts.model;
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, chat_template_kwargs: { enable_thinking: !!opts.thinking }, ...body }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
    });
  } catch (err) {
    throw new NemotronError(err instanceof Error && err.name === "TimeoutError" ? "Nemotron timed out" : "Nemotron network error");
  }
  if (!res.ok) throw new NemotronError(`Nemotron returned HTTP ${res.status}`);
  const json: any = await res.json().catch(() => null);
  if (!json?.choices?.[0]?.message) throw new NemotronError("Nemotron returned no message");
  return json;
}

/** Picks on the select model (Ultra), falling back to the fallback model (Lightning) if that call fails. */
async function chat(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  schema: object,
): Promise<{ content: string; model: string }> {
  const m = models();
  const request = {
    messages,
    temperature: 0.6,
    max_tokens: 1500,
    // Loose JSON mode looped on itself with thinking off; a strict schema keeps the reply well-formed.
    response_format: { type: "json_schema", json_schema: { name: "evening_plan", schema, strict: true } },
  };
  let lastErr: unknown;
  for (const model of [...new Set([m.select, m.fallback])]) {
    try {
      const body = await nemotronRequest(request, { model, timeoutMs: 30_000 });
      const content = body.choices[0].message.content;
      if (typeof content !== "string" || !content.trim()) throw new NemotronError("Nemotron returned no content");
      return { content, model };
    } catch (err) {
      lastErr = err;
      console.warn(`[nemotron] ${modelLabel(model)} failed (${err instanceof Error ? err.message : err})${model !== m.fallback ? "; falling back" : ""}`);
    }
  }
  throw lastErr;
}

/** Pull the first JSON object out of a reply, tolerating code fences. */
function parseJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

export interface SelectionInput {
  prompt: string;
  tasteSummary: string;
  candidates: Partial<Record<Category, Candidate[]>>;
  budgetCad: number;
  dinnerOverBudget: boolean;
  /** Liked names each category's reason may cite (seed profile plus thumbs-up). */
  citeable: Record<Category, string[]>;
  /** The mood agent's reading and chosen Qloo tags, if any. */
  moodLine?: string;
  /** Profile names; two names means a date night for two different tastes. */
  people: string[];
  /** Taste-memory notes learned from this browser's thumbs. */
  memory?: string[];
  /** Date night: Qloo's compare analysis in words. */
  overlapLine?: string;
  /** Name of the Toronto area the taste map favours, if known. */
  hotspot?: string;
}

export interface Selection {
  /** Model that produced the accepted reply. */
  model?: string;
  movie?: { id: string; reason: string };
  dinner?: { id: string; reason: string };
  playlist?: { title: string; artistIds: string[]; reason: string };
}

function candidateLines(category: Category, list: Candidate[]): string {
  return list
    .map((c) => {
      const bits = [c.id, c.name];
      if (c.year) bits.push(String(c.year));
      if (c.affinity !== undefined) bits.push(`taste match ${Math.round(c.affinity * 100)}%`);
      if (c.popularity !== undefined) bits.push(`popularity ${Math.round(c.popularity * 100)}%`);
      if (c.matches?.length) {
        const per = c.matches.map((m) => `${m.name} ${m.affinity === undefined ? "?" : `${Math.round(m.affinity * 100)}%`}`).join(", ");
        bits.push(c.forBoth ? `for both (${per})` : `uneven (${per})`);
      }
      if (category === "dinner") bits.push(`est. $${estimatedCostCad(c)} CAD`);
      if (category === "dinner" && c.areaScore !== undefined) bits.push(`taste-area ${Math.round(c.areaScore * 100)}%${c.neighborhood ? ` (${c.neighborhood})` : ""}`);
      if (c.tags.length) bits.push(`tags: ${c.tags.slice(0, 4).join(", ")}`);
      return `- ${bits.join(" | ")}`;
    })
    .join("\n");
}

const SHAPES: Record<Category, string> = {
  movie: `"movie": { "id": "<movie candidate id>", "reason": "<one line>" }`,
  dinner: `"dinner": { "id": "<dinner candidate id>", "reason": "<one line>" }`,
  playlist: `"playlist": { "title": "<short playlist title>", "artistIds": ["<artist candidate id>", ...], "reason": "<one line about the set>" }`,
};

function buildPrompt(input: SelectionInput, categories: Category[]): string {
  const sections = categories.map((cat) => {
    const list = input.candidates[cat] ?? [];
    const heading = cat === "playlist" ? "ARTIST candidates (playlist)" : `${cat.toUpperCase()} candidates`;
    return `${heading}:\n${candidateLines(cat, list)}`;
  });
  const artistCount = input.candidates.playlist?.length ?? 0;
  const rules = [
    "Choose ONLY ids that appear in the candidate lists, copied exactly. Never invent a title, place, or artist.",
    "The three picks must feel like one coherent evening matching the request's mood.",
    "Prefer candidates with a high taste match and popularity (well-known, well-loved picks) unless a less-known one clearly fits the mood better.",
    "Each reason is one warm, specific line (max 18 words): what makes the pick right tonight, then the taste it connects to. Speak to the person as \"you\".",
    ...categories.map((cat) => `The ${cat} reason must name one of: ${input.citeable[cat].join(", ")}. Never name the pick itself as something they liked.`),
    "Write fresh wording for each reason; do not reuse phrasing across picks.",
    ...(input.people.length > 1
      ? [
          `This is a date night for two people with different tastes: the person planning ("you") and their partner ("your partner"). Pick what both will enjoy. Each candidate shows Qloo's taste match for each person; "for both" means Qloo rates it highly for both — strongly prefer those, and avoid "uneven" ones.`,
          `Each reason should connect the pick to BOTH people, speaking to the planner as "you", naming something each liked when possible (e.g. "Your love of X meets your partner's Y"). Never invent names for them.`,
        ]
      : []),
  ];
  if (categories.includes("dinner")) {
    rules.push("For dinner, prefer a sit-down spot that suits an evening meal over a coffee shop or bakery when one is available.");
    rules.push(
      `Dinner candidates show a "taste-area" score: how strongly Qloo's Toronto taste map favours where the place is${input.hotspot ? ` (the hotspot is around ${input.hotspot})` : ""}. Prefer higher taste-area scores when choices are otherwise close.`,
    );
    if (input.dinnerOverBudget) {
      rules.push(`The only dinner candidate is OVER the $${input.budgetCad} CAD budget; its reason must still connect it to a liked food AND say plainly that its estimated cost is over budget.`);
    }
  }
  if (categories.includes("playlist")) {
    rules.push(
      artistCount >= 3
        ? "The playlist uses 3 to 5 distinct artist ids and a short evocative title; the reason explains the set as a whole."
        : `The playlist uses all ${artistCount} artist ids and a short evocative title; the reason explains the set as a whole.`,
    );
  }
  return [
    `Request: "${input.prompt}"`,
    `Dinner budget: $${input.budgetCad} CAD for one, before tip.`,
    ...(input.moodLine ? [`Mood read from the request: ${input.moodLine}. Candidates were already steered by these tags; prefer picks that fit this mood.`] : []),
    `Taste history:\n${input.tasteSummary}`,
    ...(input.overlapLine ? [`Where their tastes meet (Qloo compare analysis): ${input.overlapLine}. A reason may mention a shared theme.`] : []),
    ...(input.memory?.length ? [`What we've learned from their thumbs (follow it unless the request says otherwise):\n${input.memory.map((m) => `- ${m}`).join("\n")}`] : []),
    ...sections,
    `Rules:\n${rules.map((r) => `- ${r}`).join("\n")}`,
    `Reply with JSON only, exactly this shape:\n{ ${categories.map((c) => SHAPES[c]).join(", ")} }`,
  ].join("\n\n");
}

const reasonSchema = { type: "string", maxLength: 200 };

/** JSON schema for exactly the categories being chosen this call. */
function replySchema(categories: Category[], artistCount: number): object {
  const props: Record<string, object> = {};
  for (const cat of categories) {
    props[cat] =
      cat === "playlist"
        ? {
            type: "object",
            additionalProperties: false,
            required: ["title", "artistIds", "reason"],
            properties: {
              title: { type: "string", maxLength: 60 },
              artistIds: { type: "array", items: { type: "string" }, minItems: Math.min(3, artistCount), maxItems: Math.min(5, artistCount) },
              reason: reasonSchema,
            },
          }
        : { type: "object", additionalProperties: false, required: ["id", "reason"], properties: { id: { type: "string" }, reason: reasonSchema } };
  }
  return { type: "object", additionalProperties: false, required: categories, properties: props };
}

const SYSTEM =
  "You are Cozy Night Planner. You pick one movie, one dinner spot, and one playlist from candidate lists supplied by a taste graph, and explain each pick in one line tied to the person's taste. You only ever return JSON.";

const cleanReason = (r: unknown) => (typeof r === "string" ? r.trim().replace(/\s+/g, " ").slice(0, 220) : "");

/** Returns the error for one category, or null when it is valid. */
function validate(category: Category, value: any, candidates: Candidate[]): string | null {
  if (!value || typeof value !== "object") return `missing "${category}" object`;
  if (!cleanReason(value.reason)) return `"${category}.reason" must be a non-empty string`;
  const allowed = new Set(candidates.map((c) => c.id));
  if (category !== "playlist") {
    return allowed.has(value.id) ? null : `"${category}.id" ${JSON.stringify(value.id)} is not one of the allowed ids`;
  }
  if (typeof value.title !== "string" || !value.title.trim()) return `"playlist.title" must be a non-empty string`;
  const ids = value.artistIds;
  if (!Array.isArray(ids)) return `"playlist.artistIds" must be an array`;
  if (new Set(ids).size !== ids.length) return `"playlist.artistIds" must not repeat`;
  const bad = ids.filter((id: unknown) => !allowed.has(id as string));
  if (bad.length) return `"playlist.artistIds" contains ids that are not allowed: ${JSON.stringify(bad)}`;
  const min = Math.min(3, candidates.length);
  if (ids.length < min || ids.length > 5) return `"playlist.artistIds" must have ${min === 3 ? "3 to 5" : `exactly ${min}`} ids`;
  return null;
}

function normalise(category: Category, value: any) {
  if (category === "playlist") {
    return { title: String(value.title).trim().slice(0, 60), artistIds: value.artistIds as string[], reason: cleanReason(value.reason) };
  }
  return { id: value.id as string, reason: cleanReason(value.reason) };
}

/**
 * Asks Nemotron to choose among the given candidates and explain each pick.
 * Invalid categories get one retry with the validation error; categories still invalid are left out.
 */
export async function selectAndExplain(input: SelectionInput): Promise<Selection> {
  const wanted = (Object.keys(input.candidates) as Category[]).filter((c) => (input.candidates[c]?.length ?? 0) > 0);
  const result: Selection = {};
  if (!wanted.length) return result;

  const userPrompt = buildPrompt(input, wanted);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: userPrompt },
  ];

  const schema = replySchema(wanted, input.candidates.playlist?.length ?? 0);
  let pending = wanted;
  for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
    const { content: reply, model } = await chat(messages, schema);
    result.model = model;
    let parsed: any = null;
    try {
      parsed = parseJson(reply);
    } catch {
      parsed = null;
    }
    const errors: string[] = [];
    const still: Category[] = [];
    for (const cat of pending) {
      const err = parsed ? validate(cat, parsed[cat], input.candidates[cat]!) : "reply was not valid JSON";
      if (err) {
        errors.push(err);
        still.push(cat);
      } else {
        (result as any)[cat] = normalise(cat, parsed[cat]);
      }
    }
    pending = still;
    if (pending.length && attempt === 0) {
      messages.push(
        { role: "assistant", content: reply.slice(0, 4000) },
        {
          role: "user",
          content: `That reply was invalid: ${errors.join("; ")}. Reply again with JSON only for ${pending
            .map((c) => `"${c}"`)
            .join(", ")}, using only ids from the candidate lists.`,
        },
      );
    }
  }
  return result;
}
