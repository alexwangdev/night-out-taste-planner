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

## Screens and Layout

One responsive screen, with no navigation, login, or sidebar:

- **Header:** “Cozy Night Planner” title, a subtitle (“One prompt plans your whole evening, from your taste.”), and compact chips showing representative likes (When Harry Met Sally, Norah Jones, Italian) and dislikes (horror, very spicy food).
- **Prompt area:** a large prompt box with “Plan my Friday night, something cozy, under $60 CAD” as its example placeholder and a **Plan my evening** button. Empty input disables the button and shows a hint beneath it. While planning, show “Finding your evening…” and no other progress text.
- **Before the first plan:** show three clickable example prompts in the results area, including the Friday-night example.
- **Results:** three cards ordered Movie, Dinner, Playlist. Cards appear in a row on wider screens and stack vertically on narrow screens. Each contains the pick name, italic one-line taste reason, and thumbs-up/down controls. Dinner also has an estimated CAD cost and budget-status badge. Show **Re-plan** only after at least one thumbs-down.
- **Retry and fallback content:** keep the prompt above the results. Render whole-request and per-card failures in the results area as specified under `States and Boundaries`.

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

## Product Decisions

- One screen, without navigation, login, or sidebar, keeps the demo focused on the core loop.
- A preloaded “cozy night” taste profile makes grounding visible without requiring signup or profile setup.
- The dinner budget is per person in CAD, before tip; a missing budget defaults to $60 CAD and is disclosed. Every restaurant cost is a labeled estimate mapped from Qloo's 1–4 price level: $15, $30, $50, and $90 CAD respectively.
- Thumbs-up protects a result, while thumbs-down marks it for replacement. Re-planning only changed disliked picks keeps the evening coherent.
- A closest over-budget match is shown transparently with a one-tap budget increase to its mapped estimate rather than hidden or presented as within budget. Unpriced restaurant candidates are ineligible; if no priced candidates remain, use the dinner retry state.
- Recommendation failures preserve the prompt and any existing good cards, so retrying does not lose work.
- Visual direction is warm, calm, and spacious, with explicit color, type, and emphasis choices.

## What We're Building

- One responsive Cozy Night Planner screen and visible preloaded taste chips.
- Prompt entry, clickable example prompts, empty-input guidance, and a visible planning state.
- One taste-grounded plan with movie, dinner, and playlist cards, each with a short reason.
- Estimated CAD dinner cost display using the agreed Qloo-level mapping, explicit $60 CAD default, and dynamic over-budget budget-increase action.
- Per-card thumbs feedback that updates the taste profile; re-plan only disliked cards while preserving liked and otherwise unchanged picks; neutral feedback on replacements.
- Whole-request and per-category retry states that preserve prompt and existing results.

## Deferred From the POC

- Accounts and profile setup: the demo uses one preloaded persona.
- Payments or booking: only an estimated meal cost is needed.
- Multiple cities and group planning: the proof demonstrates one person's plan.
- Persistent personal profiles across sessions: outside the one-persona demo.
- Server-side taste-profile persistence: deferred until after Basics for the Nebius project version, which needs memory across sessions.

## Possible Later Enhancements

Allow people to create and save their own taste profiles, then expand to multiple cities or group plans. Add booking or payment flows only if the product grows beyond recommendations.

## Non-Goals

- Signup, authentication, or account management, to keep the demo immediately usable.
- Completing a purchase or reservation; the dinner price is an estimate.
- Streaming or playing the movie/music; these are recommendations.
- Group coordination, multi-city selection, or user-authored profiles in this proof of concept.
- Hiding a failed category or silently violating the dinner budget.

## Open Questions

- None that block the product definition. Exact sample choices, taste-graph entity IDs, and integration behavior are technical details for `4-spec`.
