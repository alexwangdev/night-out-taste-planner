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

- [ ] **2. One prompt plans a whole cozy evening on screen, with reasons**
  Becomes usable: Open the page, see the taste chips and three example prompts, enter or tap "Plan my Friday night, something cozy, under $60 CAD", see "Finding your evening…", then Movie, Dinner, and Playlist cards, each with an italic taste-based reason. Dinner shows its estimated CAD cost and budget badge.
  Why now: This is the unique kernel — one coherent evening with reasons tied to taste — so it comes immediately after the risk is cleared. It also brings up the client scaffold and the warm Look and Feel, so the early hands-on check happens on the real thing.
  PRD ref: `prd.md > The Core Journey` (steps 1–3), `prd.md > Screens and Layout`, `prd.md > Look and Feel`, `prd.md > Features and Behavior`
  Spec ref: `spec.md > CAD Budget Filter`, `spec.md > Nebius Nemotron Selection and Explanation`, `spec.md > Express API and Request Validation`, `spec.md > React App and Taste Header`, `spec.md > Prompt Form and Example Prompts`, `spec.md > Plan Cards and Feedback`, `spec.md > Client API Adapter`, `spec.md > Look and Feel`
  Build: Add `services/budget.ts` (first `$N` parse, $60 default, 1→15/2→30/3→50/4→90 mapping, unpriced excluded), `services/nemotron.ts` (Token Factory chat call, JSON parse, allowlist validation, one retry), `services/planner.ts`, `routes/plan.ts` (`POST /api/plan`), `index.ts` (`GET /health`, CORS). Scaffold `client/` with Vite + React and build TasteHeader, PromptForm, ExamplePrompts, PlanCard, the API adapter, and `styles.css`.
  Verify (mechanical): `npm run build` passes in both packages; a small budget check script confirms parsing and mapping; `curl /health` returns ok; `curl POST /api/plan` with the Friday prompt returns three slots whose IDs are all in that request's Qloo candidate set and whose names come from Qloo records.
  Learner check: Start both dev servers, open the page, tap the Friday-night example, and say whether the three picks feel like one cozy evening and whether the reasons sound tied to your taste.
  Commit: `Plan a full evening from one prompt`

- [ ] **3. Thumbs-down one pick and re-plan just that pick**
  Becomes usable: Thumbs-up marks a card gold and protects it; thumbs-down marks it for replacement and reveals **Re-plan**. Re-plan replaces only the disliked cards, leaves everything else identical, and new cards start neutral. Repeatable.
  Why now: This is the second half of the kernel — the "oh, that's cool" moment. It builds directly on slice 2's cards, and feedback IDs need to flow into requests before the edge cases are layered on.
  PRD ref: `prd.md > The Core Journey` (steps 4–5), `prd.md > Update taste and re-plan selected picks`
  Spec ref: `spec.md > Plan Merge and Retry Handling`, `spec.md > Plan Cards and Feedback`, `spec.md > Client API Adapter`, `spec.md > Data Model`
  Build: Add in-page like/dislike ID lists in `App.tsx`, thumbs controls on PlanCard, and `POST /api/replan`, which queries Qloo and Nemotron for only the disliked categories (likes as signals, dislikes as exclusions) and merges them with the browser's snapshot.
  Verify (mechanical): `npm run build` passes in both; `curl POST /api/replan` with `replace: ["dinner"]` and a snapshot returns byte-identical movie and playlist slots, plus a dinner whose ID differs from the disliked one and isn't in the exclusions.
  Learner check: Plan an evening, thumbs-up the movie, thumbs-down the restaurant, hit Re-plan, and confirm only the restaurant changed, the movie stayed gold, and the new restaurant has neutral thumbs.
  Commit: `Add thumbs feedback and focused re-plan`

- [ ] **4. Budget edge cases and failures never leave a blank or dishonest screen**
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
