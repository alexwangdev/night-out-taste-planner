---
doc: model-benchmark
---

# Nemotron model benchmark (Token Factory)

Measured on Oct 29, 2026 against `api.tokenfactory.nebius.com` with the app's real requests (captured from a live solo plan for “A rainy Sunday date night, something romantic, $60 CAD” and a live two-person plan for Sam + Jordan). Two runs per row. **Valid** means the reply parsed under the strict JSON schema and every chosen ID was one of the Qloo candidates (or, for the mood step, that the model made tool calls).

| Step | Model | Reasoning | Valid | Avg latency |
|---|---|---|---|---|
| mood tool call | `NVIDIA-Nemotron-3-Nano-30B-A3B` | off | 2/2 | 1.2 s |
| solo selection | `NVIDIA-Nemotron-3-Nano-30B-A3B` | off | 1/2 | 2.1 s |
| duo selection | `NVIDIA-Nemotron-3-Nano-30B-A3B` | off | 2/2 | 1.8 s |
| duo selection | `NVIDIA-Nemotron-3-Nano-30B-A3B` | on | 2/2 | 30.3 s |
| mood tool call | `Nemotron-3_5-Lightning` | off | 2/2 | 1.5 s |
| solo selection | `Nemotron-3_5-Lightning` | off | 2/2 | 1.2 s |
| duo selection | `Nemotron-3_5-Lightning` | off | 2/2 | 1.4 s |
| duo selection | `Nemotron-3_5-Lightning` | on | 0/2 (ran out of tokens) | 54.2 s |
| mood tool call | `nemotron-3-super-120b-a12b` | off | 2/2 | 1.8 s |
| solo selection | `nemotron-3-super-120b-a12b` | off | 1/2 | 1.9 s |
| duo selection | `nemotron-3-super-120b-a12b` | off | 2/2 | 1.9 s |
| duo selection | `nemotron-3-super-120b-a12b` | on | 2/2 | 19.8 s |
| mood tool call | `Nemotron-3-Ultra-550b-a55b` | off | 2/2 | 1.2 s |
| solo selection | `Nemotron-3-Ultra-550b-a55b` | off | 2/2 | 1.5 s |
| duo selection | `Nemotron-3-Ultra-550b-a55b` | off | 2/2 | 2.0 s |
| duo selection | `Nemotron-3-Ultra-550b-a55b` | on | 2/2 | 8.3 s |

### Full mood agent (both turns: tool calls, Qloo tag searches, then choosing tags)

Five varied prompts (“fun but cozy” date night, rainy romantic, promotion celebration, quiet night in, 90s nostalgia), one run each:

| Model | Prompts that produced mood tags | Avg latency |
|---|---|---|
| `NVIDIA-Nemotron-3-Nano-30B-A3B` | 4/5 | 3.2 s |
| `Nemotron-3_5-Lightning` | 5/5 | 2.0 s |
| `Nemotron-3-Ultra-550b-a55b` | 5/5 | 3.8 s |

Nano was the fastest at the first turn alone (1.2 s) but its second turn was slower and once returned nothing usable, so the full agent runs on Lightning.

## What we route where, and why

- **Mood agent → Nemotron 3.5 Lightning (reasoning off).** Every prompt produced mood tags and it was the fastest end to end (2.0 s average over both turns). Nano was quickest on the first tool-call turn alone but missed 1 of 5 prompts across the full agent.
- **Picking and explaining (solo and date night) → Nemotron 3 Ultra 550B (reasoning off).** Every reply valid, 1.5–2.0 s, and the most specific reasons — for two people it reliably names one thing each person liked. Nano and Super each returned an ID outside the candidates once (the server would retry), and their reasons were more generic.
- **Fallback → Nemotron 3.5 Lightning.** If the Ultra call errors or times out, the same request is retried on Lightning (1.2–1.4 s, valid 2/2) so a plan still arrives.
- **Reasoning on was not used for live picks.** Ultra with reasoning took 8.3 s and dropped the “name both people” instruction; Super with reasoning took 19.8 s; Lightning with reasoning spent its whole token budget thinking and returned nothing. Reasoning is used where latency doesn't matter: the background taste memory (slice 14).
- **Photos → Nemotron 3.5 Super VL with reasoning on** (slice 12). On a test shelf photo, reasoning off returned the record sleeves and food in ~1.3–1.6 s but missed all four film titles printed sideways on spines; reasoning on read all of them in ~6.2 s. Photo reading is a one-off step in profile setup, so the extra seconds are worth it.

Each model is overridable with `NEMOTRON_MOOD_MODEL`, `NEMOTRON_SELECT_MODEL`, `NEMOTRON_FALLBACK_MODEL`, `NEMOTRON_VISION_MODEL`, and `NEMOTRON_MEMORY_MODEL`. Re-run it from `server/` with `npm run bench`.
