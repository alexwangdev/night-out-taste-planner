import { useState } from "react";
import { ApiError, compareAlone, type AloneCheck, type CompareAloneResult } from "../api/client";
import type { PersonMatch, PlanResponse, TasteProfile } from "../types";

/**
 * Live "Compare with Nemotron alone" for the plan on screen: the same prompt and taste(s) answered by the
 * pick model with no Qloo grounding, every suggestion checked in Qloo, shown beside this plan.
 */
const pct = (x?: number) => (x === undefined ? "–" : `${Math.round(x * 100)}%`);
const lowOf = (matches?: PersonMatch[], affinity?: number) =>
  matches && matches.length > 1 ? Math.min(...matches.map((m) => m.affinity ?? 0)) : affinity;

function flags(c: AloneCheck, kind: "movie" | "place" | "artist") {
  return [
    !c.verified ? (kind === "place" ? "not found in Toronto" : "not found in Qloo") : null,
    c.closed ? "marked closed" : null,
    c.echo ? "one of your own favourites" : null,
    kind === "place" && c.fitsBudget === false ? `Qloo price ≈ $${c.qlooEstimateCad}, over budget` : null,
  ].filter((x): x is string => !!x);
}

function AloneItem({ c, kind, label }: { c: AloneCheck; kind: "movie" | "place" | "artist"; label: string }) {
  const f = flags(c, kind);
  return (
    <li className={f.length ? "g-bad" : ""}>
      <span className="g-kind">{label}</span>
      {c.name}
      {kind === "place" && c.claimedCostCad !== undefined ? <span className="g-small"> (said ${c.claimedCostCad})</span> : null}
      {c.tasteMatch !== undefined ? <span className="g-small"> · {pct(c.tasteMatch)}</span> : null}
      {f.length ? <span className="g-flag"> — {f.join(", ")}</span> : null}
    </li>
  );
}

interface Props {
  prompt: string;
  result: PlanResponse;
  profiles?: TasteProfile[];
  budgetOverride?: number;
}

export function GroundingCompare({ prompt, result, profiles, budgetOverride }: Props) {
  const [state, setState] = useState<{ kind: "idle" | "loading" | "done" | "error"; data?: CompareAloneResult; message?: string }>({ kind: "idle" });
  const plan = result.plan;

  async function run() {
    setState({ kind: "loading" });
    try {
      setState({ kind: "done", data: await compareAlone(prompt, profiles, budgetOverride) });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof ApiError && err.kind === "rate_limited" ? "Too many comparisons in a minute — wait a moment." : "Couldn't run the comparison right now — try again.",
      });
    }
  }

  if (state.kind === "idle" || state.kind === "error") {
    return (
      <div className="compare-cta">
        <button type="button" className="secondary" onClick={run} disabled={!prompt.trim()}>
          Compare with Nemotron alone
        </button>
        <span className="section-note">
          {state.kind === "error" ? state.message : "Ask the same model the same thing without Qloo, and check its answers in Qloo."}
        </span>
      </div>
    );
  }
  if (state.kind === "loading") {
    return (
      <div className="compare-cta">
        <span className="section-note" aria-live="polite">
          Asking Nemotron on its own, then checking every suggestion in Qloo…
        </span>
      </div>
    );
  }

  const a = state.data!.modelAlone;
  const alone = [a.movie, ...a.restaurants, ...a.artists];
  const echoes = [a.movie, ...a.artists].filter((c) => c.echo).length;
  const badPlaces = a.restaurants.filter((c) => !c.verified || c.closed).length;
  const overBudget = a.restaurants.filter((c) => c.fitsBudget === false).length;
  const aloneScores = alone.map((c) => c.tasteMatch).filter((x): x is number => x !== undefined);
  type Row = { label: string; name: string; match?: number; extra?: string };
  const grounded: Row[] = ([
    plan.movie.ok ? { label: "Movie", name: plan.movie.card.name, match: lowOf(plan.movie.card.matches, plan.movie.card.affinity) } : null,
    plan.dinner.ok
      ? { label: "Dinner", name: plan.dinner.card.name, match: lowOf(plan.dinner.card.matches, plan.dinner.card.affinity), extra: `≈ $${plan.dinner.card.estimatedCostCad}` }
      : null,
    ...(plan.playlist.ok ? plan.playlist.card.artists.map((x) => ({ label: "Artist", name: x.name, match: lowOf(x.matches, x.affinity) })) : []),
  ] as (Row | null)[]).filter((x): x is Row => x !== null);
  const groundedScores = grounded.map((g) => g.match).filter((x): x is number => x !== undefined);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined);

  const findings = [
    echoes ? `${echoes} of ${1 + a.artists.length} movie/artist picks were your own favourites` : null,
    badPlaces ? `${badPlaces} of ${a.restaurants.length} restaurants not in Toronto or marked closed` : null,
    overBudget ? `${overBudget} restaurant${overBudget > 1 ? "s" : ""} over budget by Qloo's price data` : null,
  ].filter(Boolean);

  return (
    <section className="saved-section compare" aria-label="Nemotron alone compared with this plan">
      <h2>Nemotron alone vs. this plan</h2>
      <p className="section-note">
        Same request, same taste{profiles && profiles.length > 1 ? "s" : ""}. Nemotron alone: {findings.length ? findings.join("; ") : "no problems found this time"}. Average Qloo
        taste match {pct(avg(aloneScores))} vs {pct(avg(groundedScores))} here.
      </p>
      <div className="g-columns">
        <div>
          <h3>{state.data!.model} alone (no Qloo)</h3>
          <ul className="g-list">
            <AloneItem c={a.movie} kind="movie" label="Movie" />
            {a.restaurants.map((c, i) => (
              <AloneItem key={i} c={c} kind="place" label="Dinner" />
            ))}
            {a.artists.map((c, i) => (
              <AloneItem key={i} c={c} kind="artist" label="Artist" />
            ))}
          </ul>
        </div>
        <div>
          <h3>Cozy Night Planner (Qloo-grounded)</h3>
          <ul className="g-list">
            {grounded.map((g, i) => (
              <li key={i}>
                <span className="g-kind">{g.label}</span>
                {g.name}
                {g.extra ? <span className="g-small"> ({g.extra})</span> : null}
                <span className="g-small"> · {pct(g.match)}</span>
              </li>
            ))}
          </ul>
          <p className="section-note">Every pick is a Qloo entity, within budget, and new to you.</p>
        </div>
      </div>
      <p className="section-note">
        Checked live in {(state.data!.ms / 1000).toFixed(1)}s. Percentages are Qloo's taste match{profiles && profiles.length > 1 ? " (the lower of your two)" : ""}.{" "}
        <a href="#/grounding">See the measured benchmark →</a>
      </p>
    </section>
  );
}
