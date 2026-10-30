---
doc: prd
status: approved
---

# Cozy Night Planner — Product Requirements

A single-screen assistant for planning one taste-matched evening from a short prompt.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey

1. The person opens Cozy Night Planner and sees the preloaded taste profile and a prompt box. Before a plan exists, three clickable example prompts are available, including “Plan my Friday night, something cozy, under $60 CAD.” (`scope.md > The Core Loop`)
2. They enter or choose a prompt and select **Plan my evening**. While it works, the screen shows “Finding your evening…” (`scope.md > The Core Loop`)
3. The results show one movie, one dinner spot, and one playlist, each with a one-line reason tied to the taste profile. The dinner card includes a clearly labeled estimated CAD meal cost for one before tip and how it compares with the dinner budget. (`scope.md > What “Working” Looks Like`)
4. They can thumbs-up or thumbs-down any pick. A thumbs-up is visibly marked and records a like; a thumbs-down records a dislike and marks that card for replacement. **Re-plan** appears only once at least one card is disliked. (`scope.md > The Unique Kernel`)
5. Selecting **Re-plan** replaces exactly the disliked cards. Other cards, including liked cards, stay exactly the same. Replacement cards start with neutral feedback. The person can repeat this loop. (`scope.md > The Core Loop`)

## Added During Build (slices 6–9)

Added at the learner's request after reviewing the hackathon judging criteria; the core journey above is unchanged.

- **Qloo details on every card:** Qloo's image, a "% taste match" from Qloo's affinity score, and action links built only from Qloo's records — Netflix/IMDb for the movie, Spotify per artist, Map/Call/Website plus rating and neighbourhood for dinner.
- **Mood agent:** the prompt's mood ("rainy Sunday date night, romantic") is turned into Qloo taste-graph tags by a Nemotron tool-calling step that searches Qloo's tags itself; those tags steer each category's candidates. Results show "How I read your night" with the tags used, and each card notes which of them it fits. Re-plans keep the same mood. If the agent fails, the plan still comes from taste alone.
- **Your own taste:** "Use my taste" opens a builder with Qloo-backed autocomplete for up to three favourite movies, artists, and foods, plus a name. The plan then comes from that profile; it is saved in the browser and the cozy demo persona stays one tap away.
- **Date night for two:** a "Just me / Date night for two" switch adds a second person (a demo partner, or their own taste). Each category is chosen from candidates Qloo scores for both people, ranked by the lower of the two scores; both people's dislikes are excluded; cards show "For both · You 92% · Partner 88%"; reasons speak to "you" and "your partner". No names are asked for. The dinner budget stays per person.

## Added During Build (slices 10–14, Nebius × NVIDIA)

- **Right model for each job:** each step runs on the NVIDIA Nemotron model that measured best for it on Token Factory (see `devpost/model-benchmark.md`); if the pick model fails, a fallback model answers so a plan still arrives.
- **Watch the agent work:** while planning, the results area lists each step live — reading the mood (and which Qloo tags it searched), asking Qloo per category, scoring for both people, applying the budget, choosing (with the model's name), and verifying every pick. Afterwards it folds under the plan as "How this plan was made".
- **Snap your taste:** in the taste builder, a photo (shelf, record sleeves, a watch-history or playlist screenshot, a meal) is read by Nemotron 3.5 Super VL and matched to Qloo; matches join the picks. The photo isn't stored.
- **Why grounding matters page (`#/grounding`, linked in the footer):** the same requests answered by Nemotron alone vs. this app, every model-only suggestion checked in Qloo — repeated favourites, restaurants not in Toronto or marked closed, budget fit by Qloo price data, and average Qloo taste match — with the raw rows and method.
- **Charts on the saved page:** "Taste match over your plans" plots each plan's Qloo match for movie, dinner, and playlist (date nights: the lower of the two people's scores), kept for the last 30 plans in the browser, with hover details, a table view, and Clear history. "How grounding compares" shows the scoreboard's four measures as paired bars (Nemotron alone vs. this app), labelled with which direction is better, linking to the full page.
- **Taste memory:** after at least three thumbs, Nemotron writes up to three short notes about what this person leans toward and avoids, each citing at least two of their thumbs. Notes show under the header and on the saved page (forget one or all), stay in the browser, and are sent with plans.

## Added During Build (slices 15–17)

- **Your taste in a few words:** under each taste (and live in the taste builder, including right after Snap your taste), a short description from Qloo's taste analysis.
- **Where your tastes meet (date night):** a panel under the two tastes with the themes Qloo finds in both (each showing a favourite from each person behind it) and where each person leans differently. Reasons can draw on it.
- **Where in Toronto:** after a plan, a map of Toronto shaded by how strongly your taste — or both of yours — concentrates in each area, with the hotspot named and the dinner pick pinned with its score. Dinner picks lean toward the hotspot when choices are otherwise close.
- *Not built:* a "trending this month" nudge — Qloo's trending data was empty on the hackathon key.

## Screens and Layout

One responsive planner screen, with no login or sidebar, plus a small **Saved in this browser** page reached from the footer:

- **Header:** “Cozy Night Planner” title, a subtitle (“One prompt plans your whole evening, from your taste.”), the **Just me / Date night for two** switch, and one row per person ("Your taste" · "Your partner's taste") with compact chips of representative likes and dislikes and **Use my taste / Edit my taste** links that open the taste builder.
- **Prompt area:** a large prompt box with “Plan my Friday night, something cozy, under $60 CAD” as its example placeholder and a **Plan my evening** button. Empty input disables the button and shows a hint beneath it. While planning, show “Finding your evening…” and no other progress text.
- **Before the first plan:** show three clickable example prompts in the results area, including the Friday-night example.
- **Results:** three cards ordered Movie, Dinner, Playlist. Cards appear in a row on wider screens and stack vertically on narrow screens. Each contains the pick name, italic one-line taste reason, and thumbs-up/down controls. Dinner also has an estimated CAD cost and budget-status badge. Show **Re-plan** only after at least one thumbs-down.
- **Retry and fallback content:** keep the prompt above the results. Render whole-request and per-card failures in the results area as specified under `States and Boundaries`.
- **Footer (bottom of the planner):** a quiet line saying thumbs and the last plan are saved in this browser only, with **See what's saved** and **Reset to starting profile**.
- **Saved in this browser page (`#/saved`):** lists saved thumbs-up and thumbs-down items by category (each removable), the last prompt and plan with its thumbs, any raised budget, the storage key and size with the raw stored JSON behind a toggle, and **Reset to starting profile**. A **Back to planner** link returns to the plan.

## Look and Feel

Warm lamplight rather than a tech dashboard: deep warm brown-charcoal background, slightly lighter warm cards, soft rounded corners and gentle shadows; no harsh borders or neon. Use warm cream body text and muted amber/gold only for the Plan button, cost badge, and selected thumbs feedback. Use a friendly serif (Georgia-like) for headings and a clean sans-serif for body text. Italicize the reason lines so they read as explanations. Keep the layout calm, spacious, and uncluttered, with no flashing or dense elements.

## Features and Behavior

### Plan and explain one evening

- Accept a short natural-language prompt with a mood/occasion and optional dinner budget.
- Produce one movie, one Toronto restaurant, and one playlist for the preloaded “cozy night” persona; show one-line reasons tied to the taste history. The Playlist card has one title and 3–5 Qloo-recommended artist names (or fewer if Qloo returns fewer artists); its reason explains the set as a whole.
- The demo profile includes liked movies When Harry Met Sally, Ratatouille, and Paddington 2; liked music Norah Jones, Bon Iver, and Fleetwood Mac; liked food Italian, ramen, and cozy cafés; and dislikes horror movies, very spicy food, and loud bars. The visible profile chips show a representative subset.
- Treat the budget as an estimated dinner for one in CAD before tip. A streaming movie and playlist cost $0 in the demo. If no budget is provided, use $60 CAD for dinner and show a small note above the plan saying so. Label every mapped cost as an estimate, never as an actual menu price. Map Qloo restaurant price levels: 1 → ≈ $15 CAD; 2 → ≈ $30 CAD; 3 → ≈ $50 CAD; 4 → ≈ $90 CAD. Filter dinner candidates by this mapped estimate before sending candidates to Nemotron.
- Exclude dinner candidates without a Qloo price level; an unpriced restaurant cannot be claimed to fit the budget. When no priced dinner candidate fits, show the closest priced match and state its estimated cost and amount over budget; do not silently exceed the budget or leave the card blank. Provide a dynamic **Raise budget to $X CAD and re-plan** action, where X is the closest match's mapped estimated cost. Movie and playlist results still appear normally.

### Update taste and re-plan selected picks

- Thumbs-up marks that card in gold and records a like in the profile, so similar taste-graph neighbors can rank higher in future plans. A liked card is protected from replacement.
- Thumbs-down records a dislike and marks that card for replacement.
- Show **Re-plan** only while at least one card has a thumbs-down. Re-plan exactly the disliked categories, preserve all other displayed cards unchanged, and reset replacement-card feedback to neutral. Allow repeated thumbs-down/re-plan cycles.

## States and Boundaries

- **Before first plan:** show the taste chips, prompt input, and three one-tap example prompts. No results cards yet.
- **Empty prompt:** keep **Plan my evening** disabled and show: “Tell me a mood or occasion — try ‘something cozy’.” Do not generate a plan.
- **Planning:** show “Finding your evening…” while the initial plan is being created.
- **No dinner within budget:** show the closest priced dinner match with its estimated CAD cost and amount over budget, plus **Raise budget to $X CAD and re-plan**, using the closest match's mapped estimate. Keep movie and playlist cards visible.
- **No priced Toronto dinner candidates:** show the dinner card's “Couldn't reach the taste service right now — your prompt is still here, just try again.” message and card-level **Try again** button. Keep movie and playlist cards visible. A retry repeats the dinner query; if there are still no priced candidates, keep the retry state. Never show an unpriced pick.
- **No explicit budget:** use $60 CAD for dinner and show a note above the plan that the default budget was assumed.
- **Whole request failure:** preserve the prompt and show in the results area: “Couldn't reach the taste service right now — your prompt is still here, just try again.” with **Try again**. Do not show technical errors or a blank screen.
- **Public API rate limit:** if too many plans are requested from one IP in a short period, preserve the prompt and current plan and show a friendly wait-and-retry message; do not expose rate-limit implementation details.
- **Single category failure:** keep the other two cards visible. In the failed card, show the same message with a card-level **Try again** button.
- **Retry with an existing plan:** keep the current plan visible during the retry. A failed retry must not erase it.
- **Feedback and re-plan:** selected feedback is visible; a like protects its card; disliked cards alone are replaced; new cards start neutral.
- **Returning in the same browser:** thumbs history, the last prompt, the current plan with its thumbs, and any raised budget are restored from that browser's local cache. Each computer/browser keeps its own; nothing is shared or stored on the server. The footer says so, links to the saved-data page, and offers **Reset to starting profile** to return to the seeded persona (for example before a demo). Removing a saved like or dislike on the saved-data page returns a card showing that thumb to neutral.

## Product Decisions

- One planner screen, without login or sidebar, keeps the demo focused on the core loop; the only other view is the saved-data page, so people can see exactly what this browser keeps.
- A preloaded “cozy night” taste profile makes grounding visible without requiring signup or profile setup.
- The dinner budget is per person in CAD, before tip; a missing budget defaults to $60 CAD and is disclosed. Every restaurant cost is a labeled estimate mapped from Qloo's 1–4 price level: $15, $30, $50, and $90 CAD respectively.
- Thumbs-up protects a result, while thumbs-down marks it for replacement. Re-planning only changed disliked picks keeps the evening coherent.
- A closest over-budget match is shown transparently with a one-tap budget increase to its mapped estimate rather than hidden or presented as within budget. Unpriced restaurant candidates are ineligible; if no priced candidates remain, use the dinner retry state.
- Recommendation failures preserve the prompt and any existing good cards, so retrying does not lose work.
- Taste feedback and the last plan persist per browser in a local cache rather than an account or server store, so each person's computer keeps its own evening history without signup; a visible reset keeps demos predictable.
- Visual direction is warm, calm, and spacious, with explicit color, type, and emphasis choices.

## What We're Building

- One responsive Cozy Night Planner screen and visible preloaded taste chips.
- Prompt entry, clickable example prompts, empty-input guidance, and a visible planning state.
- One taste-grounded plan with movie, dinner, and playlist cards, each with a short reason.
- Estimated CAD dinner cost display using the agreed Qloo-level mapping, explicit $60 CAD default, and dynamic over-budget budget-increase action.
- Per-card thumbs feedback that updates the taste profile; re-plan only disliked cards while preserving liked and otherwise unchanged picks; neutral feedback on replacements.
- Whole-request and per-category retry states that preserve prompt and existing results.

## Deferred From the POC

- Accounts: profiles live in the browser; no signup.
- Payments or booking: only an estimated meal cost is needed.
- Multiple cities and groups larger than two.
- Persistent personal profiles across devices or accounts: outside the one-persona demo (same-browser persistence is in scope via the local cache).
- Server-side taste-profile persistence: deferred until after Basics for the Nebius project version, which needs memory across sessions.

## Possible Later Enhancements

Sync taste profiles across devices, then expand to multiple cities or larger groups. Add booking or payment flows only if the product grows beyond recommendations.

## Non-Goals

- Signup, authentication, or account management, to keep the demo immediately usable.
- Completing a purchase or reservation; the dinner price is an estimate.
- Streaming or playing the movie/music; these are recommendations.
- Coordinating groups larger than two, or multi-city selection, in this proof of concept.
- Hiding a failed category or silently violating the dinner budget.

## Open Questions

- None that block the product definition. Exact sample choices, taste-graph entity IDs, and integration behavior are technical details for `4-spec`.
