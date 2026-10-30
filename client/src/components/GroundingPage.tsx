import { useEffect, useState } from "react";

/** Shapes written by server/src/scripts/eval-grounding.ts into client/public/grounding.json. */
interface Check {
  name: string;
  verified: boolean;
  echo?: boolean;
  closed?: boolean;
  matchedName?: string;
  claimedCostCad?: number;
  qlooEstimateCad?: number;
  fitsBudget?: boolean;
  tasteMatch?: number;
}
interface Pick {
  name: string;
  tasteMatch?: number;
  qlooEstimateCad?: number;
  fitsBudget?: boolean;
}
interface Scenario {
  title: string;
  prompt: string;
  people: string[];
  budgetCad: number;
  modelAlone: { movie: Check; restaurants: Check[]; artists: Check[] }[];
  grounded: { movie: Pick | null; dinner: Pick | null; artists: Pick[] };
}
interface Report {
  generatedAt: string;
  model: string;
  runsPerScenario: number;
  method: string;
  summary: {
    modelAlone: {
      suggestions: number;
      verifiedInQloo: number;
      moviesAndArtists: number;
      echoes: number;
      restaurants: number;
      restaurantsFoundInToronto: number;
      restaurantsMarkedClosed: number;
      restaurantsWithinBudgetByQloo: number;
      restaurantsWithQlooPrice: number;
      avgTasteMatch?: number;
    };
    grounded: { suggestions: number; verifiedInQloo: number; echoes: number; dinners: number; dinnersWithinBudget: number; avgTasteMatch?: number };
  };
  scenarios: Scenario[];
}

const pct = (x?: number) => (x === undefined ? "–" : `${Math.round(x * 100)}%`);

function Tile({ title, alone, grounded, note }: { title: string; alone: string; grounded: string; note: string }) {
  return (
    <div className="g-tile">
      <p className="g-tile-title">{title}</p>
      <div className="g-tile-values">
        <div>
          <span className="g-num">{alone}</span>
          <span className="g-who">Nemotron alone</span>
        </div>
        <div>
          <span className="g-num g-num-good">{grounded}</span>
          <span className="g-who">Cozy Night Planner</span>
        </div>
      </div>
      <p className="section-note">{note}</p>
    </div>
  );
}

function CheckItem({ c, kind }: { c: Check; kind: "movie" | "place" | "artist" }) {
  const flags = [
    !c.verified ? (kind === "place" ? "not found in Toronto" : "not found in Qloo") : null,
    c.closed ? "marked closed" : null,
    c.echo ? "one of your own favourites" : null,
    kind === "place" && c.fitsBudget === false ? `Qloo price ≈ $${c.qlooEstimateCad}, over budget` : null,
  ].filter(Boolean);
  return (
    <li className={flags.length ? "g-bad" : ""}>
      {c.name}
      {kind === "place" && c.claimedCostCad !== undefined ? <span className="g-small"> (said ${c.claimedCostCad})</span> : null}
      {c.tasteMatch !== undefined ? <span className="g-small"> · {pct(c.tasteMatch)}</span> : null}
      {flags.length ? <span className="g-flag"> — {flags.join(", ")}</span> : null}
    </li>
  );
}

export function GroundingPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/grounding.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setReport)
      .catch(() => setFailed(true));
  }, []);

  const s = report?.summary;
  const badPlaces = s ? s.modelAlone.restaurants - s.modelAlone.restaurantsFoundInToronto + s.modelAlone.restaurantsMarkedClosed : 0;

  return (
    <main className="page grounding-page">
      <a href="#/" className="back">
        ← Back to planner
      </a>
      <h1>Why grounding matters</h1>
      <p className="subtitle">
        The same evening requests, answered by NVIDIA Nemotron on its own and by Cozy Night Planner, where Nemotron can only choose among Qloo's
        taste-graph results. Every model-only suggestion was checked against Qloo.
      </p>
      {failed ? <p className="empty">The latest results couldn't be loaded.</p> : null}
      {report && s ? (
        <>
          <div className="g-tiles">
            <Tile
              title="Suggestions that just repeat your favourites"
              alone={`${s.modelAlone.echoes} of ${s.modelAlone.moviesAndArtists}`}
              grounded={`${s.grounded.echoes}`}
              note="Movies and artists the person had already told us they love — no discovery."
            />
            <Tile
              title="Restaurants not in Toronto or marked closed"
              alone={`${badPlaces} of ${s.modelAlone.restaurants}`}
              grounded="0"
              note={`${s.modelAlone.restaurants - s.modelAlone.restaurantsFoundInToronto} couldn't be found in Toronto; ${s.modelAlone.restaurantsMarkedClosed} are marked closed in Qloo.`}
            />
            <Tile
              title="Dinner within budget, by Qloo's price data"
              alone={`${s.modelAlone.restaurantsWithinBudgetByQloo} of ${s.modelAlone.restaurantsWithQlooPrice}`}
              grounded={`${s.grounded.dinnersWithinBudget} of ${s.grounded.dinners}`}
              note="Model-only places that Qloo has a price level for; the planner filters by budget before the model sees anything."
            />
            <Tile
              title="Average Qloo taste match"
              alone={pct(s.modelAlone.avgTasteMatch)}
              grounded={pct(s.grounded.avgTasteMatch)}
              note="Qloo's affinity of each pick to the person's favourites (two people: the lower of the two). Repeated favourites can't be scored."
            />
          </div>

          {report.scenarios.map((sc) => (
            <section key={sc.title} className="saved-section g-scenario">
              <h2>{sc.title}</h2>
              <p className="saved-prompt">“{sc.prompt}”</p>
              <div className="g-columns">
                <div>
                  <h3>Nemotron alone</h3>
                  {sc.modelAlone.map((r, i) => (
                    <ul key={i} className="g-list">
                      <CheckItem c={r.movie} kind="movie" />
                      {r.restaurants.map((c, j) => (
                        <CheckItem key={j} c={c} kind="place" />
                      ))}
                      {r.artists.map((c, j) => (
                        <CheckItem key={j} c={c} kind="artist" />
                      ))}
                    </ul>
                  ))}
                </div>
                <div>
                  <h3>Cozy Night Planner</h3>
                  <ul className="g-list">
                    {[sc.grounded.movie, sc.grounded.dinner, ...sc.grounded.artists]
                      .filter((x): x is Pick => !!x)
                      .map((p, i) => (
                        <li key={i}>
                          {p.name}
                          {p === sc.grounded.dinner && p.qlooEstimateCad !== undefined ? <span className="g-small"> (≈ ${p.qlooEstimateCad})</span> : null}
                          <span className="g-small"> · {pct(p.tasteMatch)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </section>
          ))}

          <section className="saved-section">
            <h2>How this was measured</h2>
            <p className="section-note">{report.method}</p>
            <p className="section-note">
              Model: {report.model} · {report.runsPerScenario} model-only runs per request · generated {new Date(report.generatedAt).toLocaleString()} ·
              re-run with <code>npm run eval</code> in <code>server/</code>.
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
