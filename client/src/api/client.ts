import type { Category, Feedback, MemoryNote, MoodRead, Overlap, Plan, PlanResponse, Presets, SearchResult, TasteProfile, TraceStep } from "../types";

const BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");

/** Kinds of failure the UI knows how to explain; never raw provider errors. */
export type ApiFailure = "unavailable" | "rate_limited" | "bad_request";

export class ApiError extends Error {
  constructor(readonly kind: ApiFailure) {
    super(kind);
  }
}

export type OnStep = (step: TraceStep) => void;

/**
 * POST that asks the server to stream the agent's steps (NDJSON). Each step goes to `onStep`; the last
 * line carries the result or the error status. Falls back to a plain JSON body if the server sends one.
 */
async function postStreaming<T>(path: string, body: unknown, onStep?: OnStep): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("unavailable");
  }
  if (res.status === 429) throw new ApiError("rate_limited");
  if (res.status === 400) throw new ApiError("bad_request");
  if (!res.ok) throw new ApiError("unavailable");
  if (!(res.headers.get("content-type") ?? "").includes("ndjson") || !res.body) return (await res.json()) as T;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: { type: string; status: number; body: unknown } | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.type === "step") onStep?.(msg.step);
    else if (msg.type === "result" || msg.type === "error") final = msg;
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        handle(buffer.slice(0, i));
        buffer = buffer.slice(i + 1);
      }
    }
    handle(buffer);
  } catch {
    throw new ApiError("unavailable");
  }
  const end = final as { type: string; status: number; body: unknown } | null;
  if (!end || end.type !== "result") throw new ApiError(end?.status === 429 ? "rate_limited" : "unavailable");
  return end.body as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("unavailable");
  }
  if (res.status === 429) throw new ApiError("rate_limited");
  if (res.status === 400) throw new ApiError("bad_request");
  if (!res.ok) throw new ApiError("unavailable");
  return (await res.json()) as T;
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`);
  } catch {
    throw new ApiError("unavailable");
  }
  if (res.status === 429) throw new ApiError("rate_limited");
  if (!res.ok) throw new ApiError(res.status === 400 ? "bad_request" : "unavailable");
  return (await res.json()) as T;
}

export interface SnapMatch {
  id: string;
  name: string;
  seen: string;
  detail?: string;
  image?: string;
}

export interface SnapResult {
  movies: SnapMatch[];
  artists: SnapMatch[];
  foods: SnapMatch[];
  unmatched: string[];
  model: string;
  ms: number;
}

/** Photo → Nemotron Super VL → Qloo matches. `image` is a JPEG data URL. */
export function snapTaste(image: string): Promise<SnapResult> {
  return post<SnapResult>("/api/snap", { image });
}

export interface AloneCheck {
  name: string;
  verified: boolean;
  echo?: boolean;
  closed?: boolean;
  matchedName?: string;
  claimedCostCad?: number;
  qlooEstimateCad?: number;
  fitsBudget?: boolean;
  tasteMatch?: number;
}

export interface CompareAloneResult {
  modelAlone: { movie: AloneCheck; restaurants: AloneCheck[]; artists: AloneCheck[] };
  budgetCad: number;
  model: string;
  ms: number;
}

/** The same request answered by the pick model with no Qloo grounding, each suggestion checked in Qloo. */
export function compareAlone(prompt: string, profiles?: TasteProfile[], budgetCad?: number): Promise<CompareAloneResult> {
  return post<CompareAloneResult>("/api/compare-alone", { prompt, profiles, budgetCad });
}

/** Qloo's "in a few words" for each profile, plus where two tastes meet. */
export function requestTaste(profiles: TasteProfile[]): Promise<{ words: string[][]; overlap?: Overlap }> {
  return post("/api/taste", { profiles });
}

/** Ask Nemotron Ultra to summarise this browser's thumbs into short taste-memory notes. */
export function requestMemory(feedback: Feedback): Promise<{ notes: MemoryNote[]; model: string; ms: number }> {
  return post("/api/memory", { liked: feedback.liked, disliked: feedback.disliked });
}

export function fetchPresets(): Promise<Presets> {
  return get<Presets>("/api/presets");
}

/** Qloo-backed autocomplete for the taste builder. */
export async function searchTaste(type: "movie" | "artist" | "food", q: string): Promise<SearchResult[]> {
  const r = await get<{ results: SearchResult[] }>(`/api/search?type=${type}&q=${encodeURIComponent(q)}`);
  return r.results;
}

export function requestPlan(
  prompt: string,
  feedback: Feedback,
  budgetCad?: number,
  profiles?: TasteProfile[],
  onStep?: OnStep,
  memory?: string[],
): Promise<PlanResponse> {
  return postStreaming<PlanResponse>("/api/plan", { prompt, feedback, budgetCad, profiles, memory }, onStep);
}

/** Regenerates only `replace`; the server returns `current` unchanged for every other category. */
export function requestReplan(
  prompt: string,
  feedback: Feedback,
  replace: Category[],
  current: Plan,
  budgetCad?: number,
  /** False for "Raise budget": the shown place wasn't disliked, so it may come back. */
  excludeShown = true,
  /** The first plan's mood reading, so re-plans keep the same mood. */
  mood?: MoodRead,
  profiles?: TasteProfile[],
  onStep?: OnStep,
  memory?: string[],
): Promise<PlanResponse> {
  return postStreaming<PlanResponse>("/api/replan", { prompt, feedback, replace, current, budgetCad, excludeShown, mood, profiles, memory }, onStep);
}
