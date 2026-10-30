export type Category = "movie" | "dinner" | "playlist";
export const CATEGORIES: Category[] = ["movie", "dinner", "playlist"];

export const QLOO_TYPES = {
  movie: "urn:entity:movie",
  place: "urn:entity:place",
  artist: "urn:entity:artist",
} as const;

export type QlooEntityType = (typeof QLOO_TYPES)[keyof typeof QLOO_TYPES];

/** A Qloo entity trimmed down to what the planner and the model need. */
export interface ActionLink {
  label: string;
  url: string;
}

/** How strongly Qloo ranks a pick for one person (two-person plans). */
export interface PersonMatch {
  name: string;
  affinity?: number;
}

export interface Candidate {
  /** Two-person plans: per-person Qloo affinity, and whether both people's Qloo results contained it. */
  matches?: PersonMatch[];
  forBoth?: boolean;
  id: string;
  name: string;
  /** Qloo restaurant price level 1–4; undefined when Qloo has none. */
  priceLevel?: number;
  /** Qloo's affinity of this entity to the request's signals, 0–1. */
  affinity?: number;
  /** Image hosted by Qloo (images.qloo.com only). */
  image?: string;
  /** Links built only from Qloo external IDs / Qloo-provided fields. */
  links: ActionLink[];
  rating?: number;
  neighborhood?: string;
  lat?: number;
  lon?: number;
  /** How strongly the taste map favours where this place is (0–1). */
  areaScore?: number;
  tags: string[];
  tagIds: string[];
  description?: string;
  address?: string;
  year?: number;
  popularity?: number;
}

export interface Named {
  id: string;
  name: string;
}

/** Whose taste a plan is for: a preset persona or one someone built from Qloo search. */
export interface TasteProfile {
  name: string;
  likedMovies: Named[];
  likedArtists: Named[];
  /** Qloo place tags, e.g. urn:tag:genre:place:restaurant:italian. */
  likedFoods: Named[];
  dislikedMovieTags: Named[];
  dislikedPlaceTags: Named[];
}

export interface QlooTag {
  id: string;
  name: string;
  type?: string;
}

/** Something the person rated in this page session; names let the model explain picks. */
export interface FeedbackItem {
  id: string;
  name: string;
  category: Category;
}

export interface Feedback {
  liked: FeedbackItem[];
  disliked: FeedbackItem[];
}

/** A Qloo tag the mood agent chose to steer one category. */
export interface MoodTag {
  id: string;
  name: string;
  category: Category;
}

export interface MoodRead {
  /** Short plain-words reading of the night, e.g. "rainy, romantic, slow". */
  reading: string;
  tags: MoodTag[];
  /** Model that read the mood (absent when re-used or when the agent fell back). */
  model?: string;
  /** The tag searches the agent chose to run. */
  searches?: string[];
}

/** Fields every card carries straight from Qloo's record. */
export interface QlooDetails {
  affinity?: number;
  image?: string;
  links: ActionLink[];
  /** Names of this request's mood tags that Qloo's record for the pick actually carries. */
  moodMatches?: string[];
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
  /** How strongly the person's (or couple's) Toronto taste map favours this spot, 0–1. */
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
  /** Average Qloo affinity of the chosen artists. */
  affinity?: number;
  reason: string;
}

export type Slot<T> = { ok: true; card: T } | { ok: false; error: "retry" };

export interface Plan {
  movie: Slot<MovieCard>;
  dinner: Slot<DinnerCard>;
  playlist: Slot<PlaylistCard>;
}

/** One visible step of the agent's work, streamed to the browser while planning. */
export interface TraceStep {
  id: string;
  label: string;
  status: "running" | "done" | "warn";
  detail?: string;
  /** Display name of the NVIDIA model doing this step, if any. */
  model?: string;
  ms?: number;
}

export type OnStep = (step: TraceStep) => void;

export interface PlanResponse {
  plan: Plan;
  budgetCad: number;
  budgetAssumed: boolean;
  mood: MoodRead;
  /** Which NVIDIA model handled each step of this response. */
  models?: { mood?: string; selection?: string };
  /** Date night: where the two tastes meet, from Qloo's compare analysis. */
  overlap?: { shared: { name: string; you: string[]; partner: string[] }[]; youLean: string[]; partnerLeans: string[] };
  /** Where in Toronto the taste concentrates (Qloo heatmap), and where the dinner pick sits. */
  area?: {
    name?: string;
    bins: { lat: number; lon: number; score: number }[];
    best: { lat: number; lon: number };
    pick?: { lat: number; lon: number; name: string; score: number };
  };
}
