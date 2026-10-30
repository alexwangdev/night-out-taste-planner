import { useEffect, useState } from "react";

/**
 * The grounding scoreboard as paired horizontal bars on one 0–100% axis:
 * Nemotron alone vs Cozy Night Planner, per measure. Bars ≤ 24px with a rounded data end,
 * a 2px gap between the pair, values labelled outside the bar end, hover tooltip with the raw counts.
 */
const ALONE = { label: "Nemotron alone", color: "#d95926" };
const OURS = { label: "Cozy Night Planner", color: "#3987e5" };

interface Summary {
  modelAlone: {
    moviesAndArtists: number;
    echoes: number;
    restaurants: number;
    restaurantsFoundInToronto: number;
    restaurantsMarkedClosed: number;
    restaurantsWithinBudgetByQloo: number;
    restaurantsWithQlooPrice: number;
    avgTasteMatch?: number;
  };
  grounded: { echoes: number; suggestions: number; dinners: number; dinnersWithinBudget: number; avgTasteMatch?: number };
}

interface Row {
  measure: string;
  better: "lower" | "higher";
  alone: { value: number; detail: string };
  ours: { value: number; detail: string };
}

function rows(s: Summary): Row[] {
  const a = s.modelAlone;
  const g = s.grounded;
  const bad = a.restaurants - a.restaurantsFoundInToronto + a.restaurantsMarkedClosed;
  return [
    {
      measure: "Repeats your own favourites",
      better: "lower",
      alone: { value: a.echoes / a.moviesAndArtists, detail: `${a.echoes} of ${a.moviesAndArtists} movies & artists` },
      ours: { value: 0, detail: `${g.echoes} — favourites are excluded` },
    },
    {
      measure: "Restaurants missing or closed",
      better: "lower",
      alone: { value: bad / a.restaurants, detail: `${bad} of ${a.restaurants} restaurants` },
      ours: { value: 0, detail: "0 — every pick comes from Qloo" },
    },
    {
      measure: "Dinner within budget",
      better: "higher",
      alone: { value: a.restaurantsWithinBudgetByQloo / a.restaurantsWithQlooPrice, detail: `${a.restaurantsWithinBudgetByQloo} of ${a.restaurantsWithQlooPrice} with a Qloo price` },
      ours: { value: g.dinnersWithinBudget / g.dinners, detail: `${g.dinnersWithinBudget} of ${g.dinners} dinners` },
    },
    {
      measure: "Average Qloo taste match",
      better: "higher",
      alone: { value: a.avgTasteMatch ?? 0, detail: "scored picks only" },
      ours: { value: g.avgTasteMatch ?? 0, detail: `${g.suggestions} picks` },
    },
  ];
}

const W = 900;
const LABEL_W = 210;
const BAR = 16;
const GAP = 2;
const ROW_H = BAR * 2 + GAP + 26;
const plotW = W - LABEL_W - 56;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** A bar from the baseline with only the data end rounded (4px). */
function barPath(x0: number, y0: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h / 2);
  if (w <= 0.5) return "";
  return `M${x0},${y0} H${x0 + w - r} Q${x0 + w},${y0} ${x0 + w},${y0 + r} V${y0 + h - r} Q${x0 + w},${y0 + h} ${x0 + w - r},${y0 + h} H${x0} Z`;
}

export function GroundingBars() {
  const [data, setData] = useState<{ summary: Summary; generatedAt: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ row: number; which: "alone" | "ours" } | null>(null);
  useEffect(() => {
    fetch("/grounding.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);
  if (failed) return <p className="empty">The grounding results couldn't be loaded.</p>;
  if (!data) return <p className="empty">Loading…</p>;

  const list = rows(data.summary);
  const H = list.length * ROW_H + 30;
  const x = (v: number) => LABEL_W + v * plotW;
  const tip = hover ? list[hover.row][hover.which] : null;

  return (
    <div className="viz">
      <ul className="viz-legend" aria-hidden="true">
        {[ALONE, OURS].map((s) => (
          <li key={s.label}>
            <span className="viz-key" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="viz-frame" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grounding scoreboard: Nemotron alone compared with Cozy Night Planner on four measures">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line className="viz-grid" x1={x(t)} x2={x(t)} y1={6} y2={H - 24} />
              <text className="viz-tick" x={x(t)} y={H - 8} textAnchor="middle">
                {pct(t)}
              </text>
            </g>
          ))}
          {list.map((r, i) => {
            const top = 8 + i * ROW_H;
            return (
              <g key={r.measure}>
                <text className="viz-label" x={0} y={top + 14}>
                  {r.measure}
                </text>
                <text className="viz-tick" x={0} y={top + 30} textAnchor="start">
                  {r.better} is better
                </text>
                {(["alone", "ours"] as const).map((which, j) => {
                  const v = r[which].value;
                  const y0 = top + j * (BAR + GAP);
                  const color = which === "alone" ? ALONE.color : OURS.color;
                  return (
                    <g key={which}>
                      {v > 0.005 ? (
                        <path d={barPath(LABEL_W, y0, v * plotW, BAR)} fill={color} opacity={hover && (hover.row !== i || hover.which !== which) ? 0.55 : 1} />
                      ) : (
                        <line x1={LABEL_W} x2={LABEL_W} y1={y0} y2={y0 + BAR} stroke={color} strokeWidth={2} />
                      )}
                      <text className="viz-value" x={x(v) + 6} y={y0 + BAR - 4}>
                        {pct(v)}
                      </text>
                      <rect
                        x={LABEL_W}
                        y={y0 - 1}
                        width={plotW + 40}
                        height={BAR + 2}
                        fill="transparent"
                        tabIndex={0}
                        aria-label={`${r.measure}, ${which === "alone" ? ALONE.label : OURS.label}: ${pct(v)}, ${r[which].detail}`}
                        onMouseEnter={() => setHover({ row: i, which })}
                        onFocus={() => setHover({ row: i, which })}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        {hover && tip ? (
          <div className="viz-tip" style={{ left: `${((LABEL_W + plotW / 2) / W) * 100}%`, top: `${((8 + hover.row * ROW_H) / H) * 100}%` }} role="status">
            <p className="viz-tip-title">{list[hover.row].measure}</p>
            <p className="viz-tip-row">
              <span className="viz-key" style={{ background: hover.which === "alone" ? ALONE.color : OURS.color }} />
              <span>{hover.which === "alone" ? ALONE.label : OURS.label}</span>
              <strong>{pct(tip.value)}</strong>
            </p>
            <p className="viz-tip-prompt">{tip.detail}</p>
          </div>
        ) : null}
      </div>
      <details className="viz-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th>Measure</th>
              <th>{ALONE.label}</th>
              <th>{OURS.label}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.measure}>
                <td>
                  {r.measure} ({r.better} is better)
                </td>
                <td>
                  {pct(r.alone.value)} · {r.alone.detail}
                </td>
                <td>
                  {pct(r.ours.value)} · {r.ours.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="section-note">
        Measured {new Date(data.generatedAt).toLocaleDateString()} on the same requests. <a href="#/grounding">See every suggestion and the method →</a>
      </p>
    </div>
  );
}
