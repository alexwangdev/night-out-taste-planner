---
doc: scope
status: approved
---

# Cozy Night Planner

A personal assistant that turns a short prompt into one taste-matched evening plan: a movie, dinner spot, and playlist.

## The Unique Kernel
The movie, restaurant, and playlist work together as one coherent evening, with a reason for each pick tied to what the person has liked before. If they dislike one pick and re-plan, that pick changes while the rest of the evening stays intact.

## Who It's For
A person planning a night out who wants a personal, cohesive recommendation instead of searching separately for a movie, meal, and music. The demo uses one preloaded “cozy night” taste profile.

## The Core Loop
Enter a prompt such as “Plan my Friday night, something cozy, under $60 CAD.” See one movie, one restaurant, and one playlist with a short taste-based reason for each. Give a pick a thumbs down and re-plan; the disliked item is replaced and the rest of the plan remains coherent.

## Inspiration & Identity
The learner described a cozy-night persona and a direct, useful experience. Further visual references and aesthetic direction are not established.

## Why This Matters to the Learner
They want to practice building with reusable agent skills and a plan-before-build workflow.

## What “Working” Looks Like
In a one-minute demo, with no signup and a preloaded taste profile, enter a Friday-night prompt with a cozy mood and a $60 CAD dinner budget. The app shows a movie, restaurant, and playlist, each with a one-line reason tied to taste history. Thumbs-down the restaurant and re-plan; only the restaurant is replaced, respecting the dislike. The budget is for an estimated typical meal for one before tip; the streaming movie and playlist cost $0 in this demo. The dinner estimate uses a clearly labeled mapping from Qloo restaurant price levels: level 1 ≈ $15 CAD, level 2 ≈ $30 CAD, level 3 ≈ $50 CAD, and level 4 ≈ $90 CAD. This visible, focused re-plan is the “oh, that’s cool” moment.

## The POC Boundary
One preloaded “cozy night” persona and one end-to-end evening-planning flow: a single prompt produces one movie, one dinner spot, and one playlist, with taste-based explanations and feedback that updates the next plan. The demo uses Toronto restaurants and CAD throughout. Dinner estimates are based on the mapped Qloo price level, not actual menu prices. The playlist has one title and 3–5 Qloo-recommended artists (fewer if fewer are returned). Use a small profile of liked movies (When Harry Met Sally, Ratatouille, Paddington 2), music (Norah Jones, Bon Iver, Fleetwood Mac), and foods (Italian, ramen, cozy cafés), plus dislikes (horror movies, very spicy food, loud bars). Use familiar names that can later resolve to taste-graph entities; exact entity IDs are a build detail.

## Later
- User accounts
- Payments
- Multiple cities
- Group planning for more than one person

## Explicitly Cut
- Signup and account management: unnecessary for demonstrating the flow with one preloaded persona.
- Payment handling: only a restaurant estimate is needed to apply the dinner budget.
- Multi-city and group planning: add data and coordination beyond the single-person proof of concept.
