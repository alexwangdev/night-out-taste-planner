import { seedIds } from "./seedIds.js";

/**
 * The one preloaded "cozy night" persona (scope.md > The POC Boundary).
 * Names are the human-readable source of truth; seedIds.ts holds the Qloo IDs
 * that `npm run probe` resolved for them.
 */
export const seedProfile = {
  likedMovies: ["When Harry Met Sally", "Ratatouille", "Paddington 2"],
  likedArtists: ["Norah Jones", "Bon Iver", "Fleetwood Mac"],
  /** Tag searches for liked food; `label` is what the person sees. */
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
  /** Representative subset for the header chips (prd.md > Screens and Layout). */
  chips: {
    likes: ["When Harry Met Sally", "Norah Jones", "Italian"],
    dislikes: ["horror", "very spicy food"],
  },
  city: "Toronto",
} as const;

export const seed = seedIds;
