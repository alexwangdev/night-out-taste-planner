/**
 * Grounding scoreboard: the same evening requests answered two ways —
 *   A) Nemotron alone (the same model the app uses for picks), asked for a movie, three Toronto restaurants
 *      with an estimated cost, and three artists;
 *   B) Cozy Night Planner (Qloo-grounded).
 * Every model-only suggestion is looked up in Qloo: does it exist (places: in Toronto), is it marked closed,
 * does Qloo's price level put it within the budget, and how well does Qloo say it matches the person's taste
 * (two people: the lower of their two scores)? Writes client/public/grounding.json for the #/grounding page.
 * Run from server/: npm run eval   (RUNS=2 by default)
 */
import { writeFileSync } from "node:fs";
import { presets } from "../data/profile.js";
import { modelAloneChecked, norm, type Check } from "../services/grounding.js";
import { modelLabel, models } from "../services/nemotron.js";
import { planEvening } from "../services/planner.js";
import type { TasteProfile } from "../types.js";

const RUNS = Number(process.env.RUNS ?? 2);

const alex: TasteProfile = {
  name: "You",
  likedMovies: [{ id: "E12149D8-3108-4019-8881-3F932AB67D38", name: "Knives Out" }],
  likedArtists: [{ id: "70CAE5BF-2F4C-445C-A3E5-4EDACFC3591C", name: "Radiohead" }],
  likedFoods: [{ id: "urn:tag:genre:place:restaurant:korean", name: "Korean" }],
  dislikedMovieTags: [],
  dislikedPlaceTags: [],
};

const scenarios: { title: string; prompt: string; people: TasteProfile[]; budget: number }[] = [
  { title: "Cozy Friday (cozy demo taste)", prompt: "Plan my Friday night, something cozy, under $60 CAD", people: [presets.cozy], budget: 60 },
  { title: "Rainy romantic Sunday (cozy demo taste)", prompt: "A rainy Sunday date night, something romantic, $40 CAD", people: [presets.cozy], budget: 40 },
  { title: "Fun night (Knives Out, Radiohead, Korean)", prompt: "Plan my Saturday night, something fun, under $50 CAD", people: [alex], budget: 50 },
  { title: "Date night for two (cozy taste + demo partner)", prompt: "Date night on Saturday, something fun but cozy, $60 CAD", people: [presets.cozy, presets.partner], budget: 60 },
];

const avg = (xs: (number | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};

async function main() {
  const out: any[] = [];
  for (const s of scenarios) {
    console.log(`\n== ${s.title}`);
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const { movie, restaurants, artists } = await modelAloneChecked(s.prompt, s.people, s.budget);
      runs.push({ movie, restaurants, artists });
      console.log(
        `  model alone #${i + 1}: ${[movie, ...restaurants, ...artists].map((c) => `${c.name}${c.verified ? "" : " ✗"}${c.echo ? " (echo)" : ""}${c.closed ? " (closed)" : ""}${c.tasteMatch !== undefined ? ` ${Math.round(c.tasteMatch * 100)}%` : ""}`).join(", ")}`,
      );
    }
    const g = await planEvening(s.prompt, s.people, { liked: [], disliked: [] });
    const two = (x: any) => (x?.matches?.length > 1 ? Math.min(...x.matches.map((m: any) => m.affinity ?? 0)) : x?.affinity);
    const grounded = {
      movie: g.plan.movie.ok ? { name: g.plan.movie.card.name, tasteMatch: two(g.plan.movie.card) } : null,
      dinner: g.plan.dinner.ok
        ? { name: g.plan.dinner.card.name, tasteMatch: two(g.plan.dinner.card), qlooEstimateCad: g.plan.dinner.card.estimatedCostCad, fitsBudget: !g.plan.dinner.card.overBudget }
        : null,
      artists: g.plan.playlist.ok ? g.plan.playlist.card.artists.map((a) => ({ name: a.name, tasteMatch: two(a) })) : [],
    };
    console.log(`  grounded: ${[grounded.movie, grounded.dinner, ...grounded.artists].map((x: any) => `${x?.name} ${Math.round((x?.tasteMatch ?? 0) * 100)}%`).join(", ")}`);
    out.push({ title: s.title, prompt: s.prompt, people: s.people.map((p) => p.name), budgetCad: s.budget, modelAlone: runs, grounded });
  }

  // Summary, recomputed from the rows above.
  const all = out.flatMap((s) => s.modelAlone.flatMap((r: any) => [r.movie, ...r.restaurants, ...r.artists]));
  const places = out.flatMap((s) => s.modelAlone.flatMap((r: any) => r.restaurants));
  const groundedItems = out.flatMap((s) => [s.grounded.movie, s.grounded.dinner, ...s.grounded.artists].filter(Boolean));
  const summary = {
    modelAlone: {
      suggestions: all.length,
      verifiedInQloo: all.filter((c: Check) => c.verified).length,
      moviesAndArtists: all.length - places.length,
      echoes: all.filter((c: Check) => c.echo).length,
      restaurants: places.length,
      restaurantsFoundInToronto: places.filter((c: Check) => c.verified).length,
      restaurantsMarkedClosed: places.filter((c: Check) => c.closed).length,
      restaurantsWithinBudgetByQloo: places.filter((c: Check) => c.fitsBudget === true).length,
      restaurantsWithQlooPrice: places.filter((c: Check) => c.fitsBudget !== undefined).length,
      avgTasteMatch: avg(all.map((c: Check) => c.tasteMatch)),
    },
    grounded: {
      suggestions: groundedItems.length,
      verifiedInQloo: groundedItems.length,
      echoes: out.reduce((n, s) => {
        const liked = new Set(s.people.flatMap((name: string) => scenarios.find((x) => x.title === s.title)!.people.filter((p) => p.name === name).flatMap((p) => [...p.likedMovies, ...p.likedArtists].map((x) => norm(x.name)))));
        return n + [s.grounded.movie, ...s.grounded.artists].filter((x: any) => x && liked.has(norm(x.name))).length;
      }, 0),
      dinners: out.length,
      dinnersWithinBudget: out.filter((s) => s.grounded.dinner?.fitsBudget).length,
      avgTasteMatch: avg(groundedItems.map((x: any) => x.tasteMatch)),
    },
  };
  const report = {
    generatedAt: new Date().toISOString(),
    model: modelLabel(models().select),
    runsPerScenario: RUNS,
    method:
      "Model alone: the app's pick model is asked for one movie, three Toronto restaurants with an estimated cost, and three artists for the same request and taste. Each suggestion is looked up with Qloo search (places within 25 miles of downtown Toronto, matched by name). Taste match is Qloo's affinity of the matched entity to the person's favourites (two people: the lower of the two). Grounded: Cozy Night Planner's own plan for the same request; all picks come from Qloo, so they are verified by construction.",
    summary,
    scenarios: out,
  };
  writeFileSync(new URL("../../../client/public/grounding.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  console.log("\nSUMMARY", JSON.stringify(summary, null, 1));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
