# Cozy Night Planner

**Try it live: https://night-out-taste-planner.vercel.app** · API: https://night-out-taste-planner.onrender.com (free tier — if the first plan is slow, open [`/health`](https://night-out-taste-planner.onrender.com/health) and wait for `{"ok":true}`; it wakes in about a minute).

One prompt plans your whole evening, from your taste: a movie, a Toronto dinner spot, and a playlist that fit together, each with a one-line reason tied to what you've liked before. Thumbs-down any pick and **Re-plan** — only that pick changes.

**What makes it Qloo-powered**

- **Taste graph, not guesses.** Every movie, restaurant, and artist comes from Qloo Insights, seeded by your favourites. Each card shows Qloo's image and a **% taste match** (Qloo affinity), plus action links built from Qloo's records: Netflix/IMDb, Spotify, Map/Call/Website.
- **A mood agent.** Nemotron 3.5 Lightning (Nebius Token Factory) reads "rainy Sunday date night, something romantic", searches Qloo's tag graph through a tool call, and steers each category with real Qloo tags (*Rainy Day Music*, *Romantic Dinners*, *Romantic Comedy*). The page shows "How I read your night" and which tags each pick fits.
- **Your own taste in seconds.** Pick up to three favourite movies, artists, and foods with Qloo-backed autocomplete; the plan comes from you. Or use the built-in cozy demo taste.
- **Date night for two different tastes.** Add your partner (a demo partner — Knives Out, Radiohead, Korean; not into musicals — or their own taste). Qloo scores every candidate for *each* person, the planner keeps what rates highly for both ("For both · You 92% · Partner 88%"), and both people's dislikes are excluded.
- **Where your tastes meet.** On date night, Qloo's compare analysis shows the themes you share (with the favourites behind them) and where you each lean differently — and the planner uses it.
- **Your taste in a few words.** Qloo's taste analysis describes every profile (and a photo-built one, instantly).
- **Where in Toronto.** A Qloo heatmap shows where your taste — or both of yours — concentrates across the city; the dinner pick leans toward that hotspot and is pinned on the map.
- **Grounded, not invented.** The model only chooses among Qloo IDs; the server rejects anything else. Names, images, prices, and links always come from Qloo.
- **Snap your taste.** Upload a photo of your shelf, record sleeves, a watch-history screenshot, or a meal — Nemotron 3.5 Super VL reads it and Qloo matches what it finds.
- **Watch the agent work.** Each step streams live — mood tags searched, candidates per category, scoring for two, budget, the model choosing, every pick verified — then folds under the plan.
- **Taste memory.** After a few thumbs, Nemotron writes short notes about what you lean toward (each citing your thumbs), kept only in your browser and used by later plans.
- **Saved in this browser (`#/saved`).** Everything kept on this computer — taste, thumbs (each removable), memory, last plan — plus charts of your taste match over past plans and of the grounding scoreboard.

Dinner budgets are CAD per person, before tip. Qloo's price level maps to an **estimate**: 1 → $15, 2 → $30, 3 → $50, 4 → $90. Unpriced places are never picked. No budget in the prompt means $60.

```
Browser (Vite + React, on Vercel)
   │  prompt + taste profile(s) + thumbs + taste memory (all kept in this browser)
   ▼
Express API (on Render — holds both API keys)
   ├─ Mood agent: Nemotron ⇄ Qloo tag search (tool calls) → mood tags
   ├─ Qloo Insights → candidates per person (movies, Toronto places, artists)
   ├─ Two people? Qloo scores every candidate for each person → keep "for both"
   ├─ Qloo compare (date night) + Qloo heatmap → shared themes, Toronto hotspot
   ├─ CAD budget filter → before the model sees anything
   ├─ Nemotron → picks allowed IDs + one-line reasons
   └─ Streams each step back to the page as it happens

Side routes: photo → Nemotron Super VL → Qloo matches (Snap your taste); thumbs → Nemotron Ultra → taste memory;
profiles → Qloo taste analysis + compare → taste words and "where your tastes meet".
```

There is no database or login. Each browser keeps its own taste, thumbs, taste memory, last plan, and taste-match history in `localStorage` (see `#/saved`). **Reset to starting profile** — in the footer and on the saved page — clears it; do that before a demo. People are just "you" and "your partner"; no names are asked for.

## NVIDIA Nemotron on Nebius Token Factory

Every model call goes to Nebius Token Factory (`api.tokenfactory.nebius.com`, OpenAI-compatible). Each step uses the Nemotron model that measured best for it on the app's real requests — full numbers in [`devpost/model-benchmark.md`](devpost/model-benchmark.md), re-run with `npm run bench`:

| Step | Model | Reasoning | Why |
| --- | --- | --- | --- |
| Mood agent (tool calls to Qloo tag search, then choosing tags) | Nemotron 3.5 Lightning | off | Read every test mood (5/5) and was fastest end to end (~2.0 s) |
| Picking the evening + one-line reasons (solo and date night) | Nemotron 3 Ultra 550B | off | Every reply valid, 1.5–2 s, most specific reasons; reliably speaks to both of you on date night |
| Fallback if the pick model fails | Nemotron 3.5 Lightning | off | Valid 2/2 at ~1.3 s, so a plan still arrives |
| Reading a photo (Snap your taste) | Nemotron 3.5 Super VL | on | Reasoning off missed every title printed sideways on spines; on read all of them (~6 s) |
| Taste memory from your thumbs | Nemotron 3 Ultra 550B | on | Runs in the background, so the extra thinking is free; notes must cite ≥ 2 thumbs |
| Choosing the clearest taste words / shared themes from Qloo's tags | Nemotron 3.5 Lightning | off | Qloo proposes the tags; the reply schema only allows Qloo's own tags, so nothing is invented |

All structured replies use strict JSON schemas, and every ID the model returns is checked against Qloo's candidates (one retry, then rejected).

### Why grounding matters (measured)

`npm run eval` asks Nemotron Ultra on its own for the same evenings, checks every suggestion in Qloo, and compares it with this app (page: `#/grounding`). In the committed run:

| | Nemotron alone | Cozy Night Planner |
| --- | --- | --- |
| Movies/artists that just repeat the person's own favourites | 24 of 32 | 0 |
| Restaurants not found in Toronto or marked closed | 7 of 24 | 0 |
| Restaurants within budget by Qloo price data | 16 of 20 | 4 of 4 |
| Average Qloo taste match | 85% | 88% |

It is also live for your own plan: under any plan, **Compare with Nemotron alone** sends the same request and taste to Nemotron Ultra without Qloo, checks each suggestion in Qloo, and shows both side by side (6 per minute per IP).

### Other Nebius tools

Only Token Factory is used. The API is hosted on Render and the page on Vercel (below).

### Feedback on Token Factory and Nemotron

- **Strict JSON schema output** (`response_format: json_schema, strict: true`) was the single most useful feature: with plain JSON mode and reasoning off, Lightning sometimes looped, repeating a key until it hit the token limit.
- **Reasoning budgets:** with reasoning on, Lightning spent its entire `max_tokens` thinking and returned no content; there's no way to cap reasoning tokens separately from the answer. `chat_template_kwargs.enable_thinking` worked reliably to switch it off.
- **Tool calling** on Lightning, Nano, Super, and Ultra all worked with the OpenAI format; Nano and Lightning sometimes pack several ideas into one tool argument ("fun and upbeat"), so we split them server-side.
- **Model range:** having Nano through Ultra plus a vision model behind one endpoint made measured per-step routing easy. Ultra with reasoning off was surprisingly fast (1.5–2 s) — faster than expected for its size — while reasoning on dropped one of our prompt instructions.
- **Latency:** most calls returned in 1–3 s; the slowest part of a plan is the taste-graph lookups, not the model.
- **Docs vs. behaviour:** the chat-completions reference says only `json_object`/`text` response formats are supported, but strict `json_schema` worked in every call we made; and the documented reasoning switch is `reasoning_effort`, while we used `chat_template_kwargs.enable_thinking`, which worked but isn't documented. Clarifying both would help.

## Pages

| URL | What it shows |
| --- | --- |
| `/` | The planner: your taste (or date night for two), prompt, live agent steps, the three cards, the Toronto taste map |
| `/#/saved` | What this browser keeps, with taste-match history and grounding charts; forget items or reset |
| `/#/grounding` | Nemotron alone vs. Cozy Night Planner on the same requests, every suggestion checked in Qloo |

## Run it locally

Needs Node 24 and npm, plus a Qloo API key and a Nebius Token Factory key.

1. Put the keys in a `.env` at the repo root (or `server/.env`). See `server/.env.example` for the names:

   ```
   QLOO_API_KEY=...
   NEBIUS_API_KEY=...
   CLIENT_ORIGIN=http://localhost:5173
   PORT=3001
   ```

   `.env` files are git-ignored at any depth; only the `.env.example` templates (names, no values) are committed.

2. Start the API:

   ```
   cd server
   npm install
   npm run dev
   ```

3. In a second terminal, start the page:

   ```
   cd client
   npm install
   npm run dev
   ```

4. Open http://localhost:5173 and tap the Friday-night example.

Useful scripts in `server/`:

| Command | What it does |
| --- | --- |
| `npm run probe` | Re-resolves the preset tastes (cozy demo and demo partner) to Qloo IDs (writes `src/data/seedIds.ts`) and prints live candidates. |
| `npm run check` | Checks the budget parsing and price-level mapping. |
| `npm run bench` | Benchmarks the Nemotron models on the app's real requests. |
| `npm run eval` | Regenerates the grounding scoreboard (`client/public/grounding.json`). |
| `npm run typecheck` / `npm run build` | TypeScript check / compile to `dist/`. |

## Deploy (public demo)

### 1. API on Render (Free Web Service)

New → Web Service → connect this GitHub repo, then:

| Setting | Value |
| --- | --- |
| Root Directory | `server` |
| Runtime | Node (version comes from `engines` in `package.json`: 24) |
| Build Command | `npm install --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

Environment variables: `QLOO_API_KEY`, `NEBIUS_API_KEY`, `CLIENT_ORIGIN=<your Vercel URL>` (no trailing slash), `NODE_ENV=production`. Render provides `PORT`. Models default to the routing above; override with `NEMOTRON_*_MODEL` if needed.

### 2. Page on Vercel (Hobby)

New Project → import this repo, then set **Root Directory** to `client`. Vercel detects Vite (build `npm run build`, output `dist`). Add the environment variable `VITE_API_BASE_URL=<your Render URL>` and deploy.

Then go back to Render and make sure `CLIENT_ORIGIN` matches the Vercel URL exactly.

The live deployment uses exactly this setup: page at `https://night-out-taste-planner.vercel.app`, API at `https://night-out-taste-planner.onrender.com` (`CLIENT_ORIGIN` set to the Vercel URL).

### 3. Check the rate limiter sees real client IPs

Plans and re-plans are limited to 10 per client IP per minute. On Render, set `DEBUG_IP=1`, redeploy, plan one evening, and look in the Render logs for a line like:

```
[ip] x-forwarded-for="203.0.113.7, 10.x.x.x" req.ip="203.0.113.7" trustProxyHops=1
```

`req.ip` should be your own public IP. If it shows a `10.x` or other internal address, set `TRUST_PROXY_HOPS` to the number of proxy addresses after yours in that header. Remove `DEBUG_IP` afterwards.

### Before a demo or judging

Render's free tier sleeps after 15 idle minutes and takes about a minute to wake. Open `https://<your-render-url>/health` first, wait for `{"ok":true}`, then open the Vercel URL. If that browser has been used before, click **Reset to starting profile** (page footer) so the demo starts from the cozy demo taste.

## Project layout

```
client/   Vite + React page
  src/App.tsx                  State, requests, page switching (#/, #/saved, #/grounding)
  src/storage.ts               Per-browser cache (localStorage)
  src/api/client.ts            API calls, including the streamed plan
  src/components/              TasteHeader (+ where your tastes meet), ProfileBuilder (+ Snap your taste), PromptForm,
                               ExamplePrompts, PlanCard, MoodChips, AgentTrace, TasteMap, SavedPage,
                               TasteHistoryChart, GroundingBars, GroundingPage
  public/grounding.json        Latest grounding scoreboard (written by `npm run eval`)
server/   Express API
  src/routes/plan.ts          POST /api/plan, /api/replan, /api/taste, /api/snap, /api/memory, /api/compare-alone; GET /api/search, /api/presets
  src/services/moodAgent.ts   Tool-calling mood agent → Qloo tags
  src/services/snap.ts        Photo → Super VL → Qloo matches
  src/services/grounding.ts      Nemotron-alone answers checked in Qloo (live compare + npm run eval)
  src/services/tasteInsights.ts  Taste words + where two tastes meet (Qloo tags + compare)
  src/services/tasteMap.ts    Toronto taste heatmap (Qloo) → hotspot + area scores
  src/services/memory.ts      Thumbs → taste-memory notes
  src/scripts/                probe, bench-models, eval-grounding
  src/services/qloo.ts        Qloo search + Insights
  src/services/budget.ts      Budget parsing, CAD mapping, pre-model filter
  src/services/nemotron.ts    Token Factory call, ID validation, one retry
  src/services/planner.ts     Mood → fetch (per person) → blend → filter → choose → merge
  src/middleware/rateLimit.ts Per-IP limits: plans 10/min, search 60/min, taste 30/min, photos 6/min, memory 10/min
  src/data/                   Preset tastes (cozy demo, demo partner) and their resolved Qloo IDs
devpost/  Scope, PRD, spec, build checklist, and the Nemotron model benchmark
```

## License

MIT — see `LICENSE`.
