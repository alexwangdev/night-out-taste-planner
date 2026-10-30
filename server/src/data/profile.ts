import type { TasteProfile } from "../types.js";
import { seedIds } from "./seedIds.js";

/** A tag to look up in Qloo: `label` is what people see, `tagQuery` what we search, `prefer` picks the right tag family. */
export interface TagSource {
  label: string;
  tagQuery: string;
  prefer?: RegExp;
}

export interface PresetSource {
  name: string;
  likedMovies: string[];
  likedArtists: string[];
  likedFoods: TagSource[];
  dislikedMovieTags: TagSource[];
  dislikedPlaceTags: TagSource[];
}

/**
 * Preloaded personas. Names are the human-readable source of truth; `npm run probe`
 * resolves them to Qloo IDs in seedIds.ts. "cozy" is the default demo persona
 * (scope.md > The POC Boundary); "partner" is a contrasting demo partner for date night.
 */
export const PRESET_SOURCES = {
  cozy: {
    name: "You",
    likedMovies: ["When Harry Met Sally", "Ratatouille", "Paddington 2"],
    likedArtists: ["Norah Jones", "Bon Iver", "Fleetwood Mac"],
    likedFoods: [
      { label: "Italian", tagQuery: "italian" },
      { label: "ramen", tagQuery: "ramen" },
      { label: "cozy cafés", tagQuery: "cafe" },
    ],
    dislikedMovieTags: [{ label: "horror movies", tagQuery: "horror" }],
    dislikedPlaceTags: [
      { label: "very spicy food", tagQuery: "spicy", prefer: /^urn:tag:offerings:place:spicy/ },
      { label: "loud bars", tagQuery: "loud", prefer: /^urn:tag:noise_level:/ },
    ],
  },
  partner: {
    name: "Your partner",
    likedMovies: ["Knives Out", "Everything Everywhere All at Once", "The Grand Budapest Hotel"],
    likedArtists: ["Phoebe Bridgers", "Radiohead", "Mitski"],
    likedFoods: [
      { label: "Korean", tagQuery: "korean" },
      { label: "Mexican", tagQuery: "mexican" },
      { label: "sushi", tagQuery: "sushi" },
    ],
    dislikedMovieTags: [{ label: "musicals", tagQuery: "musical" }],
    dislikedPlaceTags: [{ label: "chain restaurants", tagQuery: "chain", prefer: /chain/ }],
  },
} satisfies Record<string, PresetSource>;

export type PresetKey = keyof typeof PRESET_SOURCES;

export const CITY = "Toronto";

/** Resolved presets (Qloo IDs), as sent to the browser and used by the planner. */
export const presets: Record<PresetKey, TasteProfile> = seedIds.presets as Record<PresetKey, TasteProfile>;

export const defaultProfile = (): TasteProfile => presets.cozy;
