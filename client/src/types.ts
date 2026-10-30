// Mirrors server/src/types.ts response shapes.
export type Category = "movie" | "dinner" | "playlist";
export const CATEGORIES: Category[] = ["movie", "dinner", "playlist"];

export interface Named {
  id: string;
  name: string;
}

/** Whose taste a plan is for (mirrors server TasteProfile). */
export interface TasteProfile {
  name: string;
  likedMovies: Named[];
  likedArtists: Named[];
  /** Qloo restaurant-genre tags. */
  likedFoods: Named[];
  dislikedMovieTags: Named[];
  dislikedPlaceTags: Named[];
}

export type Presets = { cozy: TasteProfile; partner: TasteProfile };

export interface PersonMatch {
  name: string;
  affinity?: number;
}

export interface SearchResult {
  id: string;
  name: string;
  detail?: string;
  image?: string;
}

export interface ActionLink {
  label: string;
  url: string;
}

export interface MoodTag {
  id: string;
  name: string;
  category: Category;
}

export interface MoodRead {
  reading: string;
  tags: MoodTag[];
}

/** Straight from Qloo's record. */
export interface QlooDetails {
  affinity?: number;
  image?: string;
  links: ActionLink[];
  /** This request's mood tags that the pick's Qloo record carries. */
  moodMatches?: string[];
  /** Two-person plans: per-person Qloo affinity. */
  matches?: PersonMatch[];
  forBoth?: boolean;
}

export interface MovieCard extends QlooDetails {
  id: string;
  name: string;
  year?: number;
  reason: string;
}

export interface DinnerCard extends QlooDetails {
  id: string;
  name: string;
  address?: string;
  neighborhood?: string;
  rating?: number;
  areaScore?: number;
  priceLevel: number;
  estimatedCostCad: number;
  budgetCad: number;
  overBudget: boolean;
  reason: string;
}

export interface PlaylistArtist {
  matches?: PersonMatch[];
  forBoth?: boolean;
  id: string;
  name: string;
  image?: string;
  affinity?: number;
  links: ActionLink[];
}

export interface PlaylistCard {
  moodMatches?: string[];
  title: string;
  artists: PlaylistArtist[];
  affinity?: number;
  reason: string;
}

export type Slot<T> = { ok: true; card: T } | { ok: false; error: "retry" };

export interface Plan {
  movie: Slot<MovieCard>;
  dinner: Slot<DinnerCard>;
  playlist: Slot<PlaylistCard>;
}

/** One taste-memory note and the thumbs it rests on. */
export interface MemoryNote {
  text: string;
  basedOn: string[];
}

export interface TasteMemory {
  notes: MemoryNote[];
  /** Which thumbs (sorted ids) the notes were written from, so they refresh only when that changes. */
  key: string;
  model?: string;
}

/** One plan's Qloo taste-match scores, kept per browser for the saved-page chart. */
export interface HistoryPoint {
  at: string;
  prompt: string;
  duo: boolean;
  /** "plan" for a fresh plan, "replan" after replacing cards. */
  kind: "plan" | "replan";
  movie?: { name: string; match: number };
  dinner?: { name: string; match: number };
  playlist?: { name: string; match: number };
}

export interface TraceStep {
  id: string;
  label: string;
  status: "running" | "done" | "warn";
  detail?: string;
  model?: string;
  ms?: number;
}

export interface PlanResponse {
  plan: Plan;
  budgetCad: number;
  budgetAssumed: boolean;
  /** Missing on plans saved by older versions. */
  mood?: MoodRead;
  models?: { mood?: string; selection?: string };
  overlap?: Overlap;
  area?: TasteArea;
}

/** Where two tastes meet, from Qloo's compare analysis. */
export interface Overlap {
  shared: { name: string; you: string[]; partner: string[] }[];
  youLean: string[];
  partnerLeans: string[];
}

/** Toronto taste map from Qloo heatmaps (bins ~1 km, scores 0–1). */
export interface TasteArea {
  name?: string;
  bins: { lat: number; lon: number; score: number }[];
  best: { lat: number; lon: number };
  pick?: { lat: number; lon: number; name: string; score: number };
}

export interface FeedbackItem {
  id: string;
  name: string;
  category: Category;
}

export interface Feedback {
  liked: FeedbackItem[];
  disliked: FeedbackItem[];
}
