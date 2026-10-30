---
doc: checklist
status: approved
---

# Build Checklist

Build mode: fast

## Slices

- [x] **1. Qloo returns real movies, Toronto restaurants, and artists for the cozy profile**
  Becomes usable: A runnable server script (`npm run probe`) that resolves the seed taste names to Qloo IDs on the hackathon host and prints real movie, priced Toronto restaurant, and artist candidates. The resolved IDs are saved in the seed profile.
  Why now: Qloo is the biggest unknown. The hackathon host (`https://hackathon.api.qloo.com`), the search route, the ID format, and whether Toronto places carry `price_level` are all unverified, and every later slice depends on them. This is the one allowed technical slice because it proves the risk and leaves runnable evidence. The server scaffold is built here too.
  PRD ref: `prd.md > Features and Behavior` (Plan and explain one evening — demo profile, price levels)
  Spec ref: `spec.md > Seed Taste Profile and Entity IDs`, `spec.md > Qloo Candidate Service`, `spec.md > Qloo Taste API`, `spec.md > File Structure`
  Build: Scaffold `server/` (package.json, tsconfig, `.env.example`), write `services/qloo.ts` (search + insights with `X-Api-Key`, `QLOO_BASE_URL` defaulting to the hackathon host), and a probe script that resolves the seed likes/dislikes, then queries `urn:entity:movie`, `urn:entity:place` with `filter.location.query=Toronto`, and `urn:entity:artist`. Write the verified IDs into `data/profile.ts`.
  Verify (mechanical): `npm run typecheck` passes; `npm run probe` prints resolved IDs for every seed name and at least one candidate per category, with a numeric `price_level` on at least one Toronto place.
  Learner check: Run `npm run probe` in `server/` and confirm the names look like things a cozy-night person would actually like, and that Toronto restaurants show price levels.
  Commit: `Resolve seed profile and fetch Qloo candidates`

- [x] **2. One prompt plans a whole cozy evening on screen, with reasons**
  Becomes usable: Open the page, see the taste chips and three example prompts, enter or tap "Plan my Friday night, something cozy, under $60 CAD", see "Finding your evening…", then Movie, Dinner, and Playlist cards, each with an italic taste-based reason. Dinner shows its estimated CAD cost and budget badge.
  Why now: This is the unique kernel — one coherent evening with reasons tied to taste — so it comes immediately after the risk is cleared. It also brings up the client scaffold and the warm Look and Feel, so the early hands-on check happens on the real thing.
  PRD ref: `prd.md > The Core Journey` (steps 1–3), `prd.md > Screens and Layout`, `prd.md > Look and Feel`, `prd.md > Features and Behavior`
  Spec ref: `spec.md > CAD Budget Filter`, `spec.md > Nebius Nemotron Selection and Explanation`, `spec.md > Express API and Request Validation`, `spec.md > React App and Taste Header`, `spec.md > Prompt Form and Example Prompts`, `spec.md > Plan Cards and Feedback`, `spec.md > Client API Adapter`, `spec.md > Look and Feel`
  Build: Add `services/budget.ts` (first `$N` parse, $60 default, 1→15/2→30/3→50/4→90 mapping, unpriced excluded), `services/nemotron.ts` (Token Factory chat call, JSON parse, allowlist validation, one retry), `services/planner.ts`, `routes/plan.ts` (`POST /api/plan`), `index.ts` (`GET /health`, CORS). Scaffold `client/` with Vite + React and build TasteHeader, PromptForm, ExamplePrompts, PlanCard, the API adapter, and `styles.css`.
  Verify (mechanical): `npm run build` passes in both packages; a small budget check script confirms parsing and mapping; `curl /health` returns ok; `curl POST /api/plan` with the Friday prompt returns three slots whose IDs are all in that request's Qloo candidate set and whose names come from Qloo records.
  Learner check: Start both dev servers, open the page, tap the Friday-night example, and say whether the three picks feel like one cozy evening and whether the reasons sound tied to your taste.
  Commit: `Plan a full evening from one prompt`

- [x] **3. Thumbs-down one pick and re-plan just that pick**
  Becomes usable: Thumbs-up marks a card gold and protects it; thumbs-down marks it for replacement and reveals **Re-plan**. Re-plan replaces only the disliked cards, leaves everything else identical, and new cards start neutral. Repeatable.
  Why now: This is the second half of the kernel — the "oh, that's cool" moment. It builds directly on slice 2's cards, and feedback IDs need to flow into requests before the edge cases are layered on.
  PRD ref: `prd.md > The Core Journey` (steps 4–5), `prd.md > Update taste and re-plan selected picks`
  Spec ref: `spec.md > Plan Merge and Retry Handling`, `spec.md > Plan Cards and Feedback`, `spec.md > Client API Adapter`, `spec.md > Data Model`
  Build: Add in-page like/dislike ID lists in `App.tsx`, thumbs controls on PlanCard, and `POST /api/replan`, which queries Qloo and Nemotron for only the disliked categories (likes as signals, dislikes as exclusions) and merges them with the browser's snapshot.
  Verify (mechanical): `npm run build` passes in both; `curl POST /api/replan` with `replace: ["dinner"]` and a snapshot returns byte-identical movie and playlist slots, plus a dinner whose ID differs from the disliked one and isn't in the exclusions.
  Learner check: Plan an evening, thumbs-up the movie, thumbs-down the restaurant, hit Re-plan, and confirm only the restaurant changed, the movie stayed gold, and the new restaurant has neutral thumbs.
  Commit: `Add thumbs feedback and focused re-plan`

- [x] **4. Budget edge cases and failures never leave a blank or dishonest screen**
  Becomes usable: A tight budget shows the closest priced restaurant with "over budget by $Y" and **Raise budget to $X CAD and re-plan**. A prompt without a budget shows the "$60 CAD assumed" note. Empty input disables the button with the hint. A failed category shows its card-level retry; a whole-request failure or rate limit keeps the prompt and the current plan with a friendly message.
  Why now: These states wrap a working core journey. Each needs a real plan around it to prove the other cards and the prompt survive.
  PRD ref: `prd.md > States and Boundaries`, `prd.md > Plan and explain one evening` (over-budget and unpriced rules)
  Spec ref: `spec.md > CAD Budget Filter`, `spec.md > Express API and Request Validation`, `spec.md > Client IP and Proxy Handling`, `spec.md > Important Failure Modes`
  Build: Closest-over-budget selection and raise-budget action; default-budget note; empty-prompt guard on client and server; per-category retry cards and a dinner-only retry call; whole-request error state that preserves the plan; `middleware/rateLimit.ts` (10/min per IP on plan and re-plan, IPv6-aware key, `trust proxy` set for Render, `/health` excluded) and the client 429 message.
  Verify (mechanical): Build passes; the budget script covers $10 (closest over budget) and no-budget ($60 default); `curl` with an empty prompt returns 400; 11 rapid `POST /api/plan` calls return 429 with `Retry-After` while `/health` still returns 200; starting the server with a bad `QLOO_API_KEY` yields retry-state slots rather than raw errors.
  Learner check: Try "something cozy under $10 CAD", "something cozy" (no budget), and an empty box, and confirm each message reads clearly and nothing disappears.
  Commit: `Handle budget edges, retries, and rate limits`

- [ ] **5. Anyone can try it from a public URL**
  Becomes usable: The client on Vercel talks to the API on Render, with keys only in Render's environment, and a README explains local setup, env names, deploy, and warming `/health`.
  Why now: The public demo URL is a hackathon requirement and the Render forwarded-IP behavior can only be verified on the real host. Everything it serves is already working locally.
  PRD ref: `prd.md > What We're Building`
  Spec ref: `spec.md > Where It Runs and How Someone Tries It`, `spec.md > Hosting`, `spec.md > Client IP and Proxy Handling`
  Build: Write `README.md`; confirm build/start scripts match the Render and Vercel settings in the spec; guide you through creating both services and setting env vars (you do the dashboard steps; keys never go in chat); check the observed `X-Forwarded-For` on Render and adjust `trust proxy` if needed.
  Verify (mechanical): The Render `/health` URL returns ok; a `POST /api/plan` against the Render URL returns a valid plan; the Vercel URL loads with no CORS errors in the console.
  Learner check: Open the Vercel URL on your phone, plan an evening, and re-plan one card.
  Commit: `Add README and deployment config`

- [x] **6. Cards show why Qloo picked them and how to act on them**
  Becomes usable: Each card shows Qloo's image, a "% taste match" from Qloo's affinity score, and action links from Qloo's records — Netflix/IMDb for the movie, Spotify per artist, Google Maps/rating/phone for dinner.
  Why now: Cheapest visible proof that the taste graph is doing the work, and it turns recommendations into an evening you can actually start. Builds on existing cards before the agent and profile changes reshape requests.
  PRD ref: `prd.md > Screens and Layout`, `prd.md > Features and Behavior`
  Spec ref: `spec.md > Qloo Candidate Service`, `spec.md > Plan Cards and Feedback`, `spec.md > Data Model`
  Build: Keep `query.affinity`, image URLs, and external IDs (netflix, imdb, spotify, google_place) plus place rating/phone on candidates; return them on cards from Qloo records only; render image, match badge, and links.
  Verify (mechanical): Build passes; a live `/api/plan` returns affinity in 0–1, image URLs on qloo.com, and links built only from Qloo external IDs; browser check shows images and working link hrefs with no console errors.
  Learner check: Plan an evening and confirm each card shows a picture, a match %, and links that open the right movie, artists, and restaurant.
  Commit: `Show Qloo images, affinity, and action links on cards`

- [x] **7. The agent reads your mood and steers Qloo with it**
  Becomes usable: A prompt's mood ("rainy Sunday date night, romantic") becomes Qloo tags chosen by a Nemotron tool-calling step that searches Qloo's tag graph; those tags steer each category's Insights request, appear as "How I read your night" chips, and each card shows which of them it matches.
  Why now: Today the prompt never reaches Qloo, so different moods return the same candidates. This makes the app genuinely agentic and Qloo-grounded, and must exist before profiles multiply the requests.
  PRD ref: `prd.md > Plan and explain one evening`
  Spec ref: `spec.md > Nebius Nemotron Selection and Explanation`, `spec.md > Qloo Candidate Service`
  Build: `services/moodAgent.ts`: Nemotron calls a `search_qloo_tags` tool (server runs Qloo `/v2/tags`), then returns chosen tag IDs per category; server keeps only IDs it actually saw; cache tag searches in memory; fall back to no mood tags on failure. Pass mood tags as Insights signals; return them with the plan.
  Verify (mechanical): Live plans for "cozy" vs "rainy Sunday date night, romantic" return different mood tags and at least one different pick; every mood tag ID came from a Qloo tag search; agent failure still yields a plan.
  Learner check: Try two very different moods and confirm the chips and picks change to fit.
  Commit: `Add mood agent that steers Qloo with taste tags`

- [x] **8. Plan from your own taste in seconds**
  Becomes usable: "Use my taste" lets someone pick favourite movies, artists, and foods with Qloo autocomplete; the plan then comes from their profile instead of the cozy demo persona, saved in their browser. The cozy persona stays one tap away.
  Why now: Every judge gets a plan for themselves — the strongest demo moment — and it reuses the per-browser cache.
  PRD ref: `prd.md > Screens and Layout`, `prd.md > Features and Behavior`
  Spec ref: `spec.md > Seed Taste Profile and Entity IDs`, `spec.md > Express API and Request Validation`, `spec.md > Data Model`
  Build: `GET /api/search` (Qloo search for movies/artists, tag search for foods) with its own rate limit; profiles sent with plan/re-plan and validated server-side; planner uses the active profile; profile builder UI with autocomplete; header chips show the active profile.
  Verify (mechanical): Build passes; `/api/search` returns Qloo IDs; a plan with a custom profile (e.g. Knives Out, Radiohead, Korean) differs from the cozy plan and its reasons cite the custom likes; invalid profiles get 400.
  Learner check: Build your own taste with three favourites and see whether the evening feels like you.
  Commit: `Let people plan from their own taste profile`

- [x] **9. Date night for two different tastes**
  Becomes usable: "Date night for two" adds a second profile (a contrasting demo partner or your own); each category is chosen from Qloo results that score well for both people, each card shows both match %s, both people's dislikes are excluded, and reasons speak to both.
  Why now: The sharpest real-world problem and the most non-obvious use of Qloo's cross-domain graph; it builds on profiles from slice 8.
  PRD ref: `prd.md > Features and Behavior`, `scope.md > The Unique Kernel`
  Spec ref: `spec.md > Qloo Candidate Service`, `spec.md > Nebius Nemotron Selection and Explanation`
  Build: Per-person Insights per category, blend by the lower of the two affinities (union of both people's tastes as fallback), exclusions from both; two-person reasons; UI toggle and partner profile.
  Verify (mechanical): Live two-person plan returns per-person affinities for each pick, no pick carrying either person's disliked tags/IDs, and reasons naming something from each person; re-plan still preserves untouched cards.
  Learner check: Plan a date night for the cozy persona and the demo partner and judge whether it is an evening both would enjoy.
  Commit: `Add date night for two blended tastes`

- [x] **10. The right Nemotron for each job**
  Becomes usable: Each step runs on the NVIDIA model that fits it — a fast model for the mood agent's tool calls, a fast model for solo picks, and a reasoning model for two-person trade-offs — chosen from measured latency and validity on Token Factory, configurable by env vars, and reported with the plan.
  Why now: The Nebius judging asks how effectively Nemotron is used; one small model with reasoning off undersells it. Routing must exist before the trace can show which model did what.
  PRD ref: `prd.md > Added During Build`
  Spec ref: `spec.md > Nebius Nemotron Selection and Explanation`
  Build: Benchmark Nano / Lightning / Super / Ultra on the real prompts (latency, valid JSON, valid IDs); route mood, solo selection, and duo selection to the measured best fits via `NEMOTRON_*_MODEL` env vars; return `models` used per step.
  Verify (mechanical): Benchmark table saved in `devpost/model-benchmark.md`; live solo and duo plans succeed with the routed models and report them; every ID still validates.
  Learner check: Plan a solo night and a date night and compare speed and reason quality.
  Commit: `Route each step to the best-fit Nemotron model`

- [x] **11. Watch the agent work**
  Becomes usable: While planning, the page streams each step live — reading the mood (model), Qloo tags searched, candidates found per category, budget filtering, scoring for two, choosing (model) — instead of a silent spinner.
  Why now: Makes Nemotron + Qloo visible to judges and in the demo video, and turns the 7–15 s wait into the show.
  PRD ref: `prd.md > States and Boundaries` (planning state)
  Spec ref: `spec.md > Express API and Request Validation`, `spec.md > Client API Adapter`
  Build: Planner emits progress events; `/api/plan` and `/api/replan` stream them as NDJSON when the client asks; the client renders a live step list and keeps the final trace collapsible under the plan.
  Verify (mechanical): A streamed plan delivers ordered step events then the same plan JSON as before; non-streaming requests still work; browser shows steps appearing before cards.
  Learner check: Plan an evening and follow the steps as they appear.
  Commit: `Stream the agent's steps while planning`

- [x] **12. Snap your taste with Nemotron Super VL**
  Becomes usable: In the taste builder, upload a photo (a shelf of films or records, a playlist or watch-history screenshot, a favourite meal); Nemotron 3.5 Super VL reads it, Qloo matches what it found, and the builder fills with real Qloo entities the person can keep or remove.
  Why now: A creative, non-obvious use of an NVIDIA vision model that makes profile setup instant — strong for the video.
  PRD ref: `prd.md > Added During Build` (own taste)
  Spec ref: `spec.md > Added During Build`
  Build: `POST /api/snap` (image ≤ 4 MB, own rate limit) → Super VL extracts movies/artists/foods as JSON → resolve each via Qloo search/tags → return suggestions; client upload control and suggestion chips.
  Verify (mechanical): A test image of known titles returns suggestions that resolve to Qloo IDs; oversize/non-image uploads are rejected; nothing is stored server-side.
  Learner check: Snap a photo of something you own or love and see whether the suggestions match.
  Commit: `Build a taste profile from a photo with Super VL`

- [x] **13. Grounding scoreboard**
  Becomes usable: A "Why grounding matters" page compares Nemotron alone against Cozy Night Planner on the same prompts: how many of the model-only restaurant/movie/artist suggestions Qloo can verify, versus 100% verified grounded picks, with the raw results.
  Why now: Credible, measured evidence for both hackathons' impact and "would it work without Qloo?" questions.
  PRD ref: `prd.md > Added During Build`
  Spec ref: `spec.md > Added During Build`
  Build: `npm run eval` script asks the model alone for picks on fixed prompts, verifies each against Qloo search (with Toronto check for places), and writes a JSON report the client renders at `#/grounding`.
  Verify (mechanical): The eval runs end to end, the report numbers recompute from the raw rows, and the page renders them.
  Learner check: Read the page and judge whether it makes the case clearly.
  Commit: `Add grounding scoreboard comparing model-only and grounded picks`

- [x] **14. Taste memory**
  Becomes usable: After a few thumbs, Nemotron writes a short memory of what this person keeps loving and avoiding; it is shown, editable/removable on the saved page, kept only in the browser, and used to steer future plans.
  Why now: Turns per-browser history into something the agent learns from — the persistence the original PRD deferred for the Nebius version — without a server store.
  PRD ref: `prd.md > Update taste and re-plan selected picks`
  Spec ref: `spec.md > Data Model`
  Build: `POST /api/memory` summarises liked/disliked items into ≤ 3 short notes (schema output); client refreshes it after feedback changes, stores it, sends it with plans; planner passes it to the selection prompt.
  Verify (mechanical): Memory endpoint returns notes grounded in the given items; plans include the memory in the selection prompt; clearing it removes it from requests.
  Learner check: Thumb a few picks, read the memory, and see whether the next plan reflects it.
  Commit: `Add per-browser taste memory written by Nemotron`

- [x] **15. Where your tastes meet**
  Becomes usable: On date night, a panel shows the themes Qloo finds in both tastes (with the favourites behind each on both sides) and where each person leans differently; the planner feeds the overlap to the pick model and the trace shows the comparison.
  Why now: Makes the date-night problem concrete and uses Qloo's compare analysis, which few entrants will.
  PRD ref: `prd.md > Added During Build (slices 15–17)`
  Spec ref: `spec.md > Added During Build (slices 15–17)`
  Build: `services/tasteInsights.ts > compareTastes` (Qloo `/v2/analysis/compare`, readable tag families, Nemotron Lightning picks 4 shared themes from Qloo's list via an enum schema), `POST /api/taste`, overlap line in the selection prompt, `OverlapPanel` in the header.
  Verify (mechanical): `/api/taste` for the demo pair returns shared themes with supporting favourites on both sides and side-only leanings; a live two-person plan includes `overlap` and a trace step; browser shows the panel.
  Learner check: Switch to date night and read whether the shared themes ring true for the two tastes.
  Commit: `Show where two tastes meet with Qloo compare`

- [x] **16. Your taste in a few words**
  Becomes usable: Under each taste (and live in the builder, including right after Snap your taste), a short Qloo description — e.g. "Introspective · Effortlessly Charming · Intimate Portrayal · folk · Italian".
  Why now: Instant, legible feedback on what the profile means to the taste graph.
  PRD ref: `prd.md > Added During Build (slices 15–17)`
  Spec ref: `spec.md > Added During Build (slices 15–17)`
  Build: `describeTaste` (Qloo `filter.type=urn:tag` style tags by popularity → Nemotron picks 3 from Qloo's list, plus top music genre and foods), cached; header rows and builder preview call `POST /api/taste`.
  Verify (mechanical): Demo profiles return 5 words each drawn only from Qloo tags/foods; builder preview updates after a snapped photo.
  Learner check: Read your words and see if they sound like you.
  Commit: `Describe each taste in a few words`

- [x] **17. Where in Toronto**
  Becomes usable: After a plan, a Toronto map shaded by how strongly your taste (or both of yours) concentrates in each ~1 km area, the hotspot named, and the dinner pick pinned with its area score; dinner choices are nudged toward the hotspot.
  Why now: A visual, novel use of Qloo heatmaps that also improves the dinner pick.
  PRD ref: `prd.md > Added During Build (slices 15–17)`
  Spec ref: `spec.md > Added During Build (slices 15–17)`
  Build: `services/tasteMap.ts` (Qloo `filter.type=urn:heatmap` per person, binned to ~1 km, lower of two scores, hotspot named from nearby Qloo restaurant neighbourhoods), `areaScore` on dinner candidates and in the model's candidate lines, `area` in the plan response, `TasteMap` SVG with a one-hue sequential ramp.
  Verify (mechanical): A live plan returns ~500 bins, a hotspot name, and an area score on the dinner card; the map renders with hover readouts and survives a re-plan of other cards.
  Learner check: Look at the map and judge whether the hotspot and dinner pin make sense for the evening.
  Commit: `Map where in Toronto your taste lives`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after slice 2 (first real evening plan on screen; feedback can still reshape reasons, layout, and look)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [not started]
Route and stops: [not started]
Edit outcome: [not started]
Reflection: [not started]
Activity mode: [not started]

## Revisions

- Qloo lookups run one at a time, with a short backoff on HTTP 429 — the hackathon key rate-limited the probe's parallel tag lookups.
- Resolved seed IDs live in a generated `server/src/data/seedIds.ts` (rewritten by `npm run probe`), and server scripts read the repo-root `.env` as well as `server/.env` — the learner already keeps both keys in the root `.env`; `spec.md > Seed Taste Profile and Entity IDs` intent is unchanged.
- The "very spicy food" and "loud bars" dislikes pin preferred tag families (`offerings:place:spicy_food`, `noise_level:qloo:loud`) — plain name search matched a dish called "loud pack".
- Live Toronto place results with the liked-food tags skew toward cafés at price level 1 (24 of 25 priced) — slice 2's Nemotron prompt should favour dinner-appropriate places among the candidates.
- Slices are written into the project folder without per-slice git commits — the learner chose to continue without git for now (the agent's shell on their machine is unavailable); the learner can commit the work at any point.
- Nemotron is called with thinking turned off and a strict JSON schema for the reply — with thinking on it spent its whole token budget reasoning without answering, and with plain JSON mode and thinking off it looped on itself. Server-side ID validation and the one retry are unchanged.
- Each reason must name a liked item from its own category (seed profile plus thumbs-up) — early replies cited the pick itself ("for a Once fan") or copied the style example.
- The server `dev` script watches only `src/` — `node --watch` crashed when the optional `server/.env` did not exist.
- The early hands-on checkpoint after slice 2 is folded into the final kick-the-tires review — the learner asked to continue straight through slices 3–5.
- Re-plan also excludes every ID currently shown in a replaced card (a playlist's thumbs-down covers all its artists), so a replacement can never repeat the disliked pick even if the browser's feedback list is incomplete.
- "Raise budget to $X" re-plans dinner without excluding the place on screen (`excludeShown: false`) — raising the budget is not a dislike, so the closest match stays eligible at its new budget.
- When all three categories fail at once, `/api/plan` returns the whole-request failure (HTTP 502) instead of three card-level retry states — matches `prd.md > States and Boundaries` for a request that produced nothing.
- Render's build command is `npm install --include=dev && npm run build` — TypeScript is a dev dependency, and a production-mode install would otherwise skip it. Slice 5 is verified locally as a production build (clean install, `npm start` with `NODE_ENV=production`, built page via `vite preview`, CORS limited to the configured origin, IP log line); the live Render/Vercel checks wait for the learner to create both services.
- Taste feedback, last prompt, current plan, thumbs, and any raised budget now persist per browser in `localStorage` (`client/src/storage.ts`), with **Reset to starting profile** — the learner asked for each computer to keep its own history. `prd.md > States and Boundaries`, `prd.md > Product Decisions`, and `spec.md > Data Model` / `React App and Taste Header` updated; still no database or server-side storage.
- The saved-data note moved to a footer at the bottom of the planner, and a **Saved in this browser** page (`#/saved`) now shows the stored likes/dislikes (each removable), last plan, raised budget, and raw JSON, with reset — the learner asked for both. `prd.md > Screens and Layout` / `Product Decisions` and `spec.md > React App and Taste Header` / `File Structure` updated; hash switching avoids a router dependency and Vercel rewrites.
- Added slices 6–9 (Qloo images/affinity/links, mood agent, own-taste profiles, date night for two) at the learner's request after reviewing the hackathon judging criteria; slice 9 brings two-person group planning back from `scope.md > Explicitly Cut`. Slice 5's live deploy remains with the learner.
- Action links are built only from Qloo external IDs (Netflix, IMDb film IDs, the most-followed Spotify ID, Google Place ID) and Qloo's phone/website fields, and images are passed through only from `images.qloo.com`; cards saved by older versions without these fields still render.
- The mood agent sends at most 2 tags per category to Insights and never movie `genre:media:*` tags; the three categories are fetched in parallel, a mood-steered call gets 7 s before retrying without mood tags, and multi-word tag searches fall back to single words — live tests showed movie genre-tag signals took 7–10 s and skewed toward unrelated films, and phrases like "fun and upbeat" match no tag. The selection prompt now sees Qloo's match and popularity scores, which steered picks away from obscure titles. Typical plan time is 7–15 s.
- Re-plan reuses the first plan's mood reading (sent back by the browser and validated) so replacements fit the same mood without another agent run.
- Presets now live in `server/src/data/profile.ts` as `PRESET_SOURCES` (cozy + the "Jordan" demo partner) and `npm run probe` resolves all of them into `seedIds.presets`; the browser loads them from `GET /api/presets`. Custom profiles hold likes only (movies, artists, Qloo restaurant-genre tags); dislikes come from the presets. `GET /api/search` has its own 60/min per-IP limit, and each API route now carries its own limiter.
- Date night blends by asking Qloo for each person's affinity to every candidate (`filter.results.entities`) and ranking by the lower score — the first version, which only kept items present in both people's top-15 lists, overlapped too little and leaned toward one person. The cozy persona is now named "Sam" so two-person reasons read naturally. `scope.md`, `prd.md`, and `spec.md` updated for slices 6–9.
- Added slices 10–14 (model routing, live agent trace, Super VL taste snap, grounding scoreboard, taste memory) at the learner's request after reviewing the Nebius × NVIDIA judging criteria.
- Model routing follows the measured benchmark (`devpost/model-benchmark.md`, `npm run bench`): Lightning for the mood agent (Nano was fastest on the first turn alone but missed 1 of 5 prompts end to end), Ultra with reasoning off for picks (solo and date night), Lightning as automatic fallback, Super VL for photos, Ultra with reasoning only for background taste memory. Reasoning-on was slower for live picks and, on Ultra, dropped the "name both people" instruction, so it is not on the critical path.
- Plans stream their steps as NDJSON when the browser sends `Accept: application/x-ndjson` (plain JSON otherwise). The trace exposed that mood-steered artist requests with `genre:music:*` tags took ~8.6 s versus ~3 s without and didn't change the picks, so those tags are dropped like movie genre tags, and slow mood-steered calls are hedged after 2.5 s with a taste-only request; a solo plan went from ~14 s to ~9 s.
- Snap your taste runs Super VL with reasoning on (off missed sideways spine text); photos are downscaled to ≤1280 px JPEG in the browser, sent as a data URL to `POST /api/snap` (own 6 MB body limit, ≤4 MB image, 6/min per IP), never stored, and each item is matched to Qloo before it joins the builder.
- The scoreboard measures echoes, Toronto existence, closures, Qloo-price budget fit, and Qloo taste match rather than only "does it exist" — Nemotron Ultra alone mostly names real places, but in the measured run 26 of 32 of its movie/artist suggestions repeated the person's own favourites and 8 of 24 restaurants were not found in Toronto or marked closed. Title matching allows prefixes so long titles aren't counted as misses. Known issue seen in the eval: a two-person playlist can include Broadway performers although Jordan dislikes musicals, because dislike tags only filter movies and places.
- Taste memory notes must each cite at least two of the person's thumbs (schema + server check) — with one-item notes allowed, Ultra overreached from a single dislike ("you prefer film and music over dining out"). `prd.md` and `spec.md` updated for slices 10–14.
- People are now just "You" and "Your partner" — no persona names and no name field — at the learner's request. The server ignores any name sent, saved profiles from older versions are relabelled on load, reasons speak to "you" / "your partner", and the grounding scoreboard was regenerated with the unnamed prompts (README numbers updated).
- At the learner's request, the saved page now charts both the per-browser taste-match history (new `history` in the cache, last 30 plans) and the grounding scoreboard (paired bars). Palette validated with the dataviz validator on the card surface; charts render at native size and scroll on phones because scaling the SVG down made labels unreadable.
- Added slices 15–17 at the learner's request (Qloo compare, taste words, heatmap). A fourth request — a "trending this month" nudge from Qloo `/v2/trending` — was dropped: on the hackathon host every trending request returned an empty list, the per-entity trends route returned 404, and Insights `audience_growth` was almost always 0, so there was no real data to show.
- Taste words and shared themes are chosen by Nemotron Lightning from Qloo's own tag lists (strict enum schema), because Qloo's raw order surfaced odd descriptors ("Visually Jarring", "Snow-laden") and broad genres ("Blues", "Rock") ahead of telling ones. On date night each like is labelled with whose it is in the pick prompt — a reason had credited one person's like to the other.
- Found after deploying: if the page loaded while the API was asleep (or during the CORS misconfiguration), the demo-taste request failed once and the whole "Your taste" row — including **Use my taste** — never appeared. The page now retries with backoff and always shows the row with **Use my taste**, plus a "server may take a moment to wake up" note until the demo taste loads.
- At the learner's request, "Why grounding matters" is now also live: a **Compare with Nemotron alone** button under any plan calls new `POST /api/compare-alone` (6/min per IP), which runs the model-alone version of that exact prompt and taste and checks it in Qloo. The eval script and the route share `services/grounding.ts`. Measured locally: 2.8–3.8 s; the panel resets when the plan changes.
