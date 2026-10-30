import type { Thumb } from "./components/PlanCard";
import {
  CATEGORIES,
  type Category,
  type Feedback,
  type FeedbackItem,
  type HistoryPoint,
  type Named,
  type PlanResponse,
  type TasteMemory,
  type TasteProfile,
} from "./types";

/** How many plans the taste-match history keeps. */
export const HISTORY_LIMIT = 30;

/**
 * Per-browser cache (localStorage). Each computer/browser keeps its own taste feedback and last plan;
 * nothing is stored on the server. Bump the version if the saved shape changes.
 */
export const STORAGE_KEY = "cozy-night-planner:v1";
const KEY = STORAGE_KEY;

export interface Saved {
  prompt: string;
  feedback: Feedback;
  result: PlanResponse | null;
  thumbs: Record<Category, Thumb>;
  budgetOverride?: number;
  /** A taste profile this person built; absent means the cozy demo persona. */
  me?: TasteProfile;
  /** Date night: the second person's custom profile (absent = demo partner) and whether two-person mode is on. */
  partner?: TasteProfile;
  duo?: boolean;
  /** Notes Nemotron wrote from this browser's thumbs. */
  memory?: TasteMemory;
  /** Qloo taste-match scores of recent plans, oldest first. */
  history?: HistoryPoint[];
}

const isPick = (v: any) => v === undefined || (v && typeof v.name === "string" && typeof v.match === "number" && v.match >= 0 && v.match <= 1);

function readHistory(v: any): HistoryPoint[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((h) => h && typeof h.at === "string" && typeof h.prompt === "string" && isPick(h.movie) && isPick(h.dinner) && isPick(h.playlist))
    .slice(-HISTORY_LIMIT)
    .map((h) => ({ at: h.at, prompt: h.prompt.slice(0, 300), duo: !!h.duo, kind: h.kind === "replan" ? "replan" : "plan", movie: h.movie, dinner: h.dinner, playlist: h.playlist }));
}

/** Profiles saved by older versions carried a name; people are now just "You" and "Your partner". */
const withName = (p: TasteProfile | undefined, name: string) => (p ? { ...p, name } : undefined);

function readMemory(v: any): TasteMemory | undefined {
  if (!v || typeof v.key !== "string" || !Array.isArray(v.notes)) return undefined;
  const notes = v.notes
    .filter((n: any) => n && typeof n.text === "string" && n.text.length <= 160 && Array.isArray(n.basedOn))
    .slice(0, 3)
    .map((n: any) => ({ text: n.text, basedOn: n.basedOn.filter((b: unknown) => typeof b === "string").slice(0, 6) }));
  return { notes, key: v.key, model: typeof v.model === "string" ? v.model : undefined };
}

const isNamedList = (v: any, max = 5): v is Named[] =>
  Array.isArray(v) && v.length <= max && v.every((x) => x && typeof x.id === "string" && typeof x.name === "string");

function readProfile(v: any): TasteProfile | undefined {
  if (!v || typeof v.name !== "string") return undefined;
  const lists = ["likedMovies", "likedArtists", "likedFoods", "dislikedMovieTags", "dislikedPlaceTags"] as const;
  if (!lists.every((k) => v[k] === undefined || isNamedList(v[k]))) return undefined;
  const p: TasteProfile = {
    name: v.name.slice(0, 40),
    likedMovies: v.likedMovies ?? [],
    likedArtists: v.likedArtists ?? [],
    likedFoods: v.likedFoods ?? [],
    dislikedMovieTags: v.dislikedMovieTags ?? [],
    dislikedPlaceTags: v.dislikedPlaceTags ?? [],
  };
  return p.likedMovies.length + p.likedArtists.length + p.likedFoods.length ? p : undefined;
}

const isItem = (v: any): v is FeedbackItem =>
  v && typeof v.id === "string" && typeof v.name === "string" && CATEGORIES.includes(v.category);

const isSlot = (v: any) => v && typeof v.ok === "boolean" && (v.ok ? v.card && typeof v.card === "object" : v.error === "retry");

function isResult(v: any): v is PlanResponse {
  return v && typeof v.budgetCad === "number" && v.plan && CATEGORIES.every((c) => isSlot(v.plan[c]));
}

/** Returns null when nothing is saved, storage is blocked, or the saved data doesn't look right. */
export function loadSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    const liked = Array.isArray(v?.feedback?.liked) ? v.feedback.liked.filter(isItem).slice(-50) : [];
    const disliked = Array.isArray(v?.feedback?.disliked) ? v.feedback.disliked.filter(isItem).slice(-50) : [];
    const result = isResult(v?.result) ? v.result : null;
    const thumbs = Object.fromEntries(
      CATEGORIES.map((c) => [c, result && (v?.thumbs?.[c] === "up" || v?.thumbs?.[c] === "down") ? v.thumbs[c] : null]),
    ) as Record<Category, Thumb>;
    const budget = typeof v?.budgetOverride === "number" && v.budgetOverride > 0 ? v.budgetOverride : undefined;
    return {
      prompt: typeof v?.prompt === "string" ? v.prompt.slice(0, 300) : "",
      feedback: { liked, disliked },
      result,
      thumbs,
      budgetOverride: result ? budget : undefined,
      me: withName(readProfile(v?.me), "You"),
      partner: withName(readProfile(v?.partner), "Your partner"),
      duo: v?.duo === true,
      memory: readMemory(v?.memory),
      history: readHistory(v?.history),
    };
  } catch {
    return null;
  }
}

export function save(state: Saved): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full, blocked, or private mode: the app still works for this page session.
  }
}

export function clearSaved(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
