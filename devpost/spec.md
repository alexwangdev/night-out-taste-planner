---
doc: spec
status: approved
---

# Cozy Night Planner — Technical Spec

## How This Works, In Plain Language

The page runs in a browser and holds the current prompt, taste feedback, and evening plan only while the page stays open. A small TypeScript API on Render talks to Qloo and Nebius so their secret keys never go to the browser. Qloo supplies real movie, Toronto restaurant, and music-artist candidates. The API applies the CAD dinner estimate before it asks Nemotron to choose among those candidates and explain the choices. The API checks every returned Qloo ID against the candidate list before any pick can appear.

The React/Vite page is hosted on Vercel. The Render service can sleep after 15 minutes without a request and may take about a minute to wake; warm it before recording and judging. There is no database in this proof of concept. Refreshing the page restores the seeded taste profile; server-side persistence is deferred until after Basics for the Nebius project version.

## The Core Journey Through the System

1. The browser shows the seeded profile and example prompt. When the person submits, it sends the prompt and current in-page feedback to the Express API.
2. The API reads the dinner budget from the prompt (or defaults it to $60 CAD), then requests Qloo candidates for movies, Toronto places, and artists using the seeded and liked entity IDs. It passes dislikes as exclusions. Qloo uses `urn:entity:movie`, `urn:entity:place`, and `urn:entity:artist`; the restaurant request uses the fixed Toronto location filter.
3. Before Nemotron sees candidates, the API maps restaurant Qloo price levels to estimated meal costs: level 1 ≈ $15 CAD, 2 ≈ $30 CAD, 3 ≈ $50 CAD, and 4 ≈ $90 CAD. It removes restaurants without a price level. It sends only in-budget dinner candidates; if none fit, it sends the closest priced candidate, explicitly marked over budget. If no priced candidate remains, the dinner card becomes a retry state and Nemotron is not asked to invent a restaurant.
4. The API sends the prompt, taste history, and remaining Qloo candidates to Nemotron 3.5 Lightning. Nemotron returns selected candidate IDs, a title and 3–5 artist IDs for the playlist (or all available when fewer than three were returned), and one-line reasons. The API validates every ID against the Qloo candidates, retries invalid category output once, and rejects it if it is still invalid. Display names and restaurant price levels come from Qloo records, never from model-generated names.
5. The API returns the plan and any per-category failures. The browser displays the Movie, Dinner, and Playlist cards. Thumbs feedback updates in-page taste data; the next request uses liked IDs as positive signals and disliked IDs as exclusions.
6. On **Re-plan**, the browser sends the disliked categories and its current card snapshot. The API asks Qloo and Nemotron to regenerate only those categories, then merges the replacement cards with the unchanged cards. Liked and neutral card data is not sent to Qloo or Nemotron for regeneration. Replacement feedback starts neutral. A failed retry leaves the previous plan on screen.

```text
Browser (Vercel, React state)
    │ prompt + feedback/current cards
    ▼
Express API (Render; holds secret keys)
    ├── Qloo Insights ── candidates, taste signals, Toronto places
    ├── CAD level mapping + budget filter ── before model call
    └── Nebius Token Factory / Nemotron ── choose allowed IDs + explain
    │ validated plan / category retry state
    ▼
Browser (renders cards; resets to seed profile on refresh)
```

PRD refs: `prd.md > The Core Journey`, `prd.md > Features and Behavior`, `prd.md > States and Boundaries`.

## Stack

- **TypeScript 5.x** for client and server — uses the learner's established language. Lock exact package versions in each package lockfile during the build.
- **React with Vite** for the single responsive client. [React](https://react.dev/), [Vite](https://vite.dev/guide/).
- **Node.js 24 LTS with Express 5** for a small JSON API on Render. The workspace currently has Node 24.11.1; use the Node 24 major on both hosts. Express keeps the server routes and secret-bearing service calls simple. [Node release status](https://nodejs.org/en/about/previous-releases), [Express 5 docs](https://expressjs.com/en/5x/api.html).
- **Built-in `fetch`** for Qloo and Nebius requests; no additional AI SDK is needed for their HTTP APIs.
- **`express-rate-limit` 8.x** for shared per-client-IP throttling on plan generation. Its built-in memory store fits one Render instance; counts reset if that process restarts. [Package documentation](https://express-rate-limit.github.io/).
- **No database or login.** Browser memory is the only store during a page session.
- **Deployment:** Vercel Hobby for the Vite frontend and Render Free Web Service for the Express API, as chosen by the learner. Vercel’s [Vite guide](https://vercel.com/docs/frameworks/frontend/vite) and Render’s [free service limits](https://render.com/docs/free).

## Where It Runs and How Someone Tries It

### Local development

Use Node 24 and npm. Start the API and client in separate terminals:

```powershell
cd server
npm install
npm run dev
```

```powershell
cd client
npm install
npm run dev
```

Open the Vite local URL printed in the client terminal. The client’s non-secret `VITE_API_BASE_URL` points to the local API (for example, `http://localhost:3001`). Put local `NEBIUS_API_KEY` and `QLOO_API_KEY` values in an ignored server `.env` file; never paste or commit them. `server/.env.example` documents variable names with blank values only.

### Public demo

- **Vercel:** connect the public GitHub repository, set the project root to `client`, build with `npm run build`, and publish `dist`. Set `VITE_API_BASE_URL` to the Render service URL.
- **Render:** set the service root to `server`, build with `npm install && npm run build`, and start with `npm start`. Set `NEBIUS_API_KEY`, `QLOO_API_KEY`, `NEBIUS_MODEL=nvidia/Nemotron-3_5-Lightning`, `CLIENT_ORIGIN` to the Vercel URL, and `PORT` as required by the host. `QLOO_BASE_URL` may override the standard Qloo API host if the issued credential specifies an event-specific host.
- Open the public Vercel URL for the demo. Before recording or judging, visit the Render `/health` endpoint to wake the free service; after 15 idle minutes Render spins it down, and waking can take about a minute. No paid database, scheduled keep-alive, or separate hosting service is part of this plan.

Submission still needs a short demo video and a public GitHub repository; the public URL also serves the other hackathons' live-demo requirement. Deployment does not replace the video.

## Look and Feel

Implement `prd.md > Look and Feel`: deep warm brown-charcoal background; slightly lighter warm cards; soft corners and shadows; cream text; muted amber/gold only for the Plan button, dinner cost badge, and selected thumbs feedback. Use Georgia-like serif headings, clean sans-serif body text, italic reason lines, and generous spacing. Use responsive CSS so the cards sit in a row on wide screens and stack on narrow screens. No external font download is required; use Georgia and system sans-serif fallbacks so the styling works offline.

## Components

### React App and Taste Header

Render the single page, title/subtitle, and the fixed visible subset of taste-profile chips. Own prompt, current cards, selected feedback, busy state, and card errors in React component state. No value is persisted to localStorage or a server session. Implements `prd.md > Screens and Layout`, `prd.md > States and Boundaries`.

### Prompt Form and Example Prompts

Provide the prompt input, disabled empty-input button and hint, three one-tap examples, and “Finding your evening…” during an initial request. Seed the placeholder with “Plan my Friday night, something cozy, under $60 CAD.” Preserve the text on failure. Implements `prd.md > Screens and Layout`, `prd.md > States and Boundaries`.

### Plan Cards and Feedback

Render Movie, Dinner, and Playlist in order. Show Qloo names, one-line reasons, feedback buttons, and dinner’s mapped estimated CAD cost/budget status. The playlist card shows a model-created title and Qloo artist names. Render card-level failure/retry content without hiding the other cards. Implement thumbs-up protection and thumbs-down replacement marking; show **Re-plan** only when at least one card is disliked. Implements `prd.md > Features and Behavior`, `prd.md > States and Boundaries`.

### Client API Adapter

Call `POST /api/plan` for an initial plan and `POST /api/replan` for selected replacements. The request contains the prompt, feedback entity IDs, and—on re-plan—the category IDs to replace plus current cards to preserve. The client does not call Qloo or Nebius directly and does not hold their keys. On HTTP 429, preserve the prompt/current cards and show the friendly wait-and-retry message. Implements `prd.md > The Core Journey`, `prd.md > Features and Behavior`, `prd.md > States and Boundaries`.

### Express API and Request Validation

Expose `GET /health`, `POST /api/plan`, and `POST /api/replan`. Validate request fields, reject empty prompts, parse the budget, enforce the Toronto location and CAD currency on the server, and return a stable JSON response with per-category success or retry error. Configure CORS for the local Vite origin and configured Vercel origin. Never return raw provider errors, keys, or stack traces. Apply one shared `express-rate-limit` window of **10 `POST /api/plan` and `POST /api/replan` requests per client IP per 60 seconds**; exclude `GET /health` so it remains available to wake Render. When the limit is reached, return HTTP 429 with standard rate-limit/`Retry-After` headers and a generic JSON error. Implements `prd.md > States and Boundaries`.

### Client IP and Proxy Handling

On Render, key the limiter by the real client IP from Render's `X-Forwarded-For` header, not the Render socket/proxy address. Configure proxy trust for the actual Render path and verify the observed header order on the deployed service; do not blindly trust arbitrary forwarded headers or key on the socket address. Use `express-rate-limit`'s IPv6-aware IP key helper rather than a hand-built raw-IP key. In local development, use the request IP. Render documents this forwarded-header requirement in its [rate-limiting guidance](https://render.com/articles/how-render-handles-ddos-attacks); `express-rate-limit` documents its [configuration and standard headers](https://express-rate-limit.github.io/). Implements `prd.md > States and Boundaries`.

### Seed Taste Profile and Entity IDs

Keep the profile names and category associations in server data: the specified liked movies, artists, foods, and seeded dislikes. Resolve those names to Qloo entity/tag IDs during the first API integration step using the Qloo lookup docs, then store the verified non-secret IDs in the profile data file. Each browser session starts with those seed IDs plus its own feedback lists. Do not ask the model to invent or resolve IDs. Implements `prd.md > Plan and explain one evening`, `prd.md > Update taste and re-plan selected picks`.

### Qloo Candidate Service

Use Qloo Insights as the only source of recommendation candidates. Request separate candidate pools for `urn:entity:movie`, `urn:entity:place`, and `urn:entity:artist`, seeded by the fixed liked entities and current positive feedback; exclude current dislikes and thumbs-down IDs. Add `filter.location.query=Toronto` for places only. Read `results.entities` and keep the Qloo `entity_id`, `name`, `properties.price_level`, tags, and relevant descriptive fields. If any category returns no candidates or its request fails, preserve it as a category failure and continue with other available categories. If the place results contain no priced candidate, Dinner uses its retry state and Nemotron does not get a restaurant candidate. Implements `prd.md > Plan and explain one evening`, `prd.md > Update taste and re-plan selected picks`, `prd.md > States and Boundaries`.

### CAD Budget Filter

Parse the first explicit `$N` budget as CAD; if none is present use 60 CAD. Map Qloo `price_level` values exactly: `1 → 15`, `2 → 30`, `3 → 50`, `4 → 90` CAD. Do not infer a cost for a missing/unknown price level; exclude that restaurant. For a stated budget, send only priced candidates at or below it to Nemotron. If none fit, send only the least-over-budget priced candidate and mark it over budget. The **Raise budget to $X CAD and re-plan** action sets the new budget to that candidate's mapped estimate. The card always labels the amount “estimated.” Implements `prd.md > Plan and explain one evening`, `prd.md > States and Boundaries`.

### Nebius Nemotron Selection and Explanation

Call Token Factory’s OpenAI-compatible `POST /v1/chat/completions` with model ID `nvidia/Nemotron-3_5-Lightning`. Send the mood/occasion prompt, taste profile names, and eligible Qloo candidate records. For each returned pick, require the exact candidate ID; for a playlist require a generated title, a unique list of 3–5 allowed artist IDs, or all available candidates if there are fewer than three, and one reason for the set. For an over-budget dinner candidate, instruct Nemotron to say clearly that the estimated CAD cost is over budget. Use the response only as selection and explanation: obtain display names and costs from Qloo/backend records.

Parse the model's JSON response and validate shape and every ID against the candidate set for that category. Retry invalid category output once with the allowed IDs and validation error. If it remains invalid, reject that category and return the PRD retry state; never render a model-created entity name. Empty Qloo results are never passed as an invitation to improvise. Implements `prd.md > Plan and explain one evening`, `prd.md > Update taste and re-plan selected picks`.

### Plan Merge and Retry Handling

For re-plan, Qloo and Nemotron receive only the disliked categories. The backend merges successful replacements with the unchanged card snapshot provided by the browser and returns the complete display plan. It does not query or regenerate liked/neutral cards. A retry failure keeps the existing snapshot visible; a category failure uses the PRD's card-level copy, while a request-level failure uses the whole-results message. Implements `prd.md > Update taste and re-plan selected picks`, `prd.md > States and Boundaries`.

## Data Model

No server-side session store or database.

- **Seed profile (server code):** liked names and resolved Qloo IDs by category, seeded dislikes/tag exclusions, and a representative subset for UI chips. Read-only baseline; restored by a page refresh.
- **Feedback profile (browser memory):** liked and disliked Qloo entity IDs. Thumbs-up adds to likes; thumbs-down adds to exclusions. Included in subsequent plan/re-plan API requests. Cleared on refresh.
- **Prompt and plan (browser memory):** current text; selected movie, place, and artist ID list/title; Qloo names and details; mapped CAD dinner estimate; reason text; feedback state; and category error/loading state. Re-plan sends current unchanged card data and replacement categories to the backend. Cleared on refresh.
- **Request data (server memory only):** process each API call and return a response; do not store user profile or plan between calls. The client supplies the in-page snapshot needed to preserve unchanged results.
- **Secrets (Render environment):** `QLOO_API_KEY`, `NEBIUS_API_KEY`; never expose them through Vite variables or commit them. `.env.example` contains names only.

Response shape is a complete plan with `movie`, `dinner`, and `playlist` slots, each either a card with Qloo IDs/data, reason, and feedback-neutral result or a retry-state error. Dinner also has `estimatedCostCad`, `budgetCad`, and `overBudget`. Playlist has `title` and `artistIds`/artist records.

## File Structure

```text
night-out-taste-planner/
├── client/
│   ├── index.html
│   ├── package.json                 # Vite and React scripts/dependencies
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx                 # React entry
│       ├── App.tsx                  # Single-screen state and request flow
│       ├── types.ts                 # Shared client response types
│       ├── api/client.ts            # Calls Render/local API
│       ├── components/
│       │   ├── TasteHeader.tsx
│       │   ├── PromptForm.tsx
│       │   ├── ExamplePrompts.tsx
│       │   └── PlanCard.tsx
│       └── styles.css               # Responsive cozy-night design
├── server/
│   ├── package.json                 # Express and TypeScript scripts/dependencies
│   ├── tsconfig.json
│   ├── .env.example                 # Variable names only; no credentials
│   └── src/
│       ├── index.ts                 # Express startup, CORS, health route
│       ├── types.ts                 # API and candidate types
│       ├── middleware/rateLimit.ts  # Per-IP plan/re-plan limit
│       ├── routes/plan.ts           # /api/plan and /api/replan
│       ├── data/profile.ts          # Seed names, Qloo IDs/tags, price mapping
│       ├── services/qloo.ts         # Qloo Insights/lookup calls
│       ├── services/budget.ts       # Prompt budget parse and CAD price mapping
│       ├── services/nemotron.ts     # Token Factory chat-completion call/validation
│       └── services/planner.ts      # Orchestrates candidate fetch, filter, select, merge
├── devpost/
│   ├── learner-profile.md           # Ignored by git
│   ├── scope.md
│   ├── prd.md
│   └── spec.md
├── .gitignore                       # Ignores profile and secrets
└── README.md                        # Local setup, env names, deploy/demo notes
```

## External Services and Dependencies

### Qloo Taste API

- **Purpose:** source of truth for movie, place, and artist candidates; no generic-model recommendations.
- **Calls:** `GET /v2/insights/` at the credential's Qloo host. Query parameters include `filter.type=urn:entity:movie|place|artist`, `signal.interests.entities=<resolved liked IDs>`, `filter.exclude.entities=<disliked IDs>`, and `take=<small candidate pool>`. For dinner add `filter.location.query=Toronto`. Use Qloo's search/lookup endpoint during the build to resolve the seeded names and tag IDs; confirm the issued credential's correct host and search route before wiring it.
- **Authentication:** `X-Api-Key: <QLOO_API_KEY>` from Render environment only. Standard documentation examples use `https://api.qloo.com`; use an event-specific host if Qloo issued one with the key.
- **Response:** documented Insights results contain `success` and `results.entities`, including `name`, `entity_id`, `subtype`, `properties`, and tags. Verify the restaurant `price_level` field against live Toronto results before relying on it.
- **Cost/rate limit:** the public documentation reviewed describes endpoint behavior but does not establish the learner's key quota or event limits. Confirm in the Qloo account/hackathon materials during the first integration step; handle 429 and 4xx responses as user-safe retry states.
- **Docs:** [Qloo API onboarding/auth](https://github.com/qloo/docs-public/blob/main/reference/api-onboarding.md), [recommendation Insights guide](https://github.com/qloo/docs-public/blob/main/reference/basic-insights-use-case.md), [parameter reference](https://github.com/qloo/docs-public/blob/main/reference/parameters.md), [entity search reference](https://github.com/qloo/docs-public/blob/main/reference/get-search.md).

### Nebius Token Factory (Nemotron)

- **Purpose:** interpret the prompt, choose IDs strictly from Qloo's eligible candidates, form the artist-based playlist title/set, and write evidence-based one-line reasons.
- **Call:** `POST https://api.tokenfactory.nebius.com/v1/chat/completions`, JSON body with `model: "nvidia/Nemotron-3_5-Lightning"`, system/user messages, and a short candidate list. Ask for JSON containing candidate IDs, playlist title/artist IDs, and reasons. The response uses OpenAI-compatible `choices[0].message.content`; parse and validate IDs server-side. Do not include restaurant candidates over budget except the closest one, marked over budget.
- **Authentication:** `Authorization: Bearer <NEBIUS_API_KEY>` from Render environment only.
- **Cost/limits:** Nebius currently lists the public Nemotron 3.5 Lightning endpoint at $0.06 per 1M input tokens and $0.24 per 1M output tokens; verify current account limits and pricing in Token Factory before demo day. [Model and pricing](https://nebius.com/services/token-factory/models/nvidia-nemotron-models-inference), [API reference](https://api.tokenfactory.nebius.com/docs).

### Hosting

- **Vercel Hobby:** public static Vite client and deployment URL; use `VITE_API_BASE_URL` only for the non-secret Render endpoint. [Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite), [Hobby plan](https://vercel.com/docs/plans/hobby).
- **Render Free Web Service:** Express API and secret environment variables. Free services spin down after 15 minutes with no inbound traffic; wake-up takes about a minute. There is no persistent filesystem, so this design stores no session data there. Warm `/health` before recording/judging. [Free service constraints](https://render.com/docs/free).

## Important Failure Modes

- **Render is asleep or provider call is unavailable/rate-limited** → show the PRD whole-request or category retry message; preserve the prompt and existing cards. Warm Render before the demo.
- **Client IP exceeds the application limit** → return HTTP 429 with `Retry-After` and standard rate-limit headers; preserve prompt/current plan and show “Too many plans in a short time. Please wait a moment, then try again.” Limit plan/re-plan requests to 10 per IP per minute; keep `/health` available.
- **Qloo returns no candidate for one type, or no Toronto place has a known price level** → show the affected card's retry message only; keep other successful cards visible. Never ask Nemotron to fill the gap.
- **Nemotron returns malformed JSON or an ID outside the allowed Qloo set** → retry that category once, then reject it into the card retry state. Never display the invalid pick.
- **Restaurant is over budget** → pass only the closest priced candidate to Nemotron with an explicit over-budget flag, show its mapped estimate and dynamic raise-budget action. Exclude any place without a price level.

## What Was Simplified and Why

- Browser memory instead of a database or server session — makes the demo reset predictably for each judge and avoids another service; server-side persistence is deferred, not cut, for the later Nebius project version.
- Fixed Toronto instead of location selection — keeps the restaurant request and demo consistent.
- A transparent four-level CAD mapping instead of actual menu prices — Qloo provides restaurant price levels, not per-person menu totals; every mapped amount is labeled an estimate.
- One public Render API instead of exposing external calls in the browser — keeps both API keys private, at the cost of a sleeping free service that must be warmed before demos.
- One Qloo candidate set and one Nemotron selection/reasoning pass for the initial plan; no separate streaming, reservations, accounts, or payments.

## Decisions and Open Issues

- **Learner decision:** Vite/React/TypeScript frontend on Vercel free tier and Express/TypeScript backend on Render free tier; public demo URL is required for later hackathons. Tradeoff: free Render sleeps after 15 idle minutes and wakes in about one minute; warm `/health` before recording and judging.
- **Learner decision:** both API keys are available and must live in Render environment variables, never in the repository or browser.
- **Learner decision:** Qloo candidates determine which entities may appear; Nemotron 3.5 Lightning interprets mood, selects among candidates, and writes explanations. Server-side allowlist validation is mandatory; retry invalid IDs once and reject remaining invalid output.
- **Learner decision:** Toronto is fixed for place recommendations; budgets and estimates are CAD. Restaurant price levels map to $15/$30/$50/$90 CAD and unknown price levels are ineligible. A dynamic raise-budget action uses the closest priced candidate's mapped cost.
- **Learner decision:** playlist card shows one title and 3–5 Qloo artist candidates, or fewer if fewer were returned, plus one reason for the set.
- **Learner decision:** current plan and feedback exist in browser memory for the open page only and reset to the seeded profile on refresh. Server-side persistence is deferred for the later Nebius version that needs cross-session memory.
- **Implementation recommendation:** limit public plan/re-plan requests to 10 per client IP per minute with `express-rate-limit`; exclude `/health`. The in-memory counter is best-effort for the single Render instance and resets when the service restarts or sleeps.
- **Clarified uncertainty:** Qloo's restaurant result does not provide an exact per-person menu price. The learner accepted a visible approximation based on Qloo's 1–4 price level and supplied the CAD mapping; unknown levels are excluded, and no priced result uses the Dinner retry state.
- **Build-time verification:** confirm the Qloo key's API host/search route, resolve the seed names/tags, and verify live Toronto result shape includes usable `price_level`; check the key's Qloo/Nebius rate limits. No API keys need to be shared in chat or committed.
- **No product decisions remain open for `5-build`.**
