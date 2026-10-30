export type Category = "movie" | "dinner" | "playlist";

export const QLOO_TYPES = {
  movie: "urn:entity:movie",
  place: "urn:entity:place",
  artist: "urn:entity:artist",
} as const;

export type QlooEntityType = (typeof QLOO_TYPES)[keyof typeof QLOO_TYPES];

/** A Qloo entity trimmed down to what the planner and the model need. */
export interface Candidate {
  id: string;
  name: string;
  /** Qloo restaurant price level 1–4; undefined when Qloo has none. */
  priceLevel?: number;
  tags: string[];
  description?: string;
  address?: string;
  year?: number;
  popularity?: number;
}

export interface QlooTag {
  id: string;
  name: string;
  type?: string;
}
