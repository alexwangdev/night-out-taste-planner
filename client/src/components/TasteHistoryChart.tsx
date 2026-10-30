import { useState } from "react";
import type { HistoryPoint } from "../types";

/**
 * Qloo taste match of each saved plan, per card. One y-axis (percent), three categorical series in fixed
 * order (palette validated on the card surface: blue / orange / aqua), 2px lines, 8px markers with a surface
 * ring, legend plus direct labels at the line ends, crosshair + tooltip on hover, and a table view.
 */
const SERIES = [
  { key: "movie", label: "Movie", color: "#3987e5" },
  { key: "dinner", label: "Dinner", color: "#d95926" },
  { key: "playlist", label: "Playlist", color: "#199e70" },
] as const;

const W = 900;
const H = 240;
const PAD = { top: 16, right: 78, bottom: 34, left: 40 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function TasteHistoryChart({ history }: { history: HistoryPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = history.flatMap((h) => SERIES.map((s) => h[s.key]?.match).filter((x): x is number => x !== undefined));
  if (history.length < 2 || !values.length) {
    return <p className="empty">Plan a couple of evenings and this will chart how well each pick matched your taste.</p>;
  }

  // Domain: snap to 5-point steps around the data, never wider than 0–100%.
  const lo = Math.max(0, Math.floor((Math.min(...values) - 0.02) * 20) / 20);
  const hi = Math.min(1, Math.ceil((Math.max(...values) + 0.02) * 20) / 20);
  const x = (i: number) => PAD.left + (history.length === 1 ? plotW / 2 : (i / (history.length - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * plotH;
  const ticks: number[] = [];
  const step = hi - lo > 0.3 ? 0.1 : 0.05;
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);

  const segments = (key: (typeof SERIES)[number]["key"]) => {
    // Break the line where a plan has no score for this card (e.g. a retry state).
    const parts: string[] = [];
    let current = "";
    history.forEach((h, i) => {
      const v = h[key]?.match;
      if (v === undefined) {
        if (current) parts.push(current);
        current = "";
      } else current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    if (current) parts.push(current);
    return parts;
  };

  // Direct labels at the right edge, nudged apart only if they would overlap.
  const last = history.length - 1;
  const ends = SERIES.map((s) => ({ s, v: history[last][s.key]?.match })).filter((e): e is { s: (typeof SERIES)[number]; v: number } => e.v !== undefined);
  const placed = new Map<string, number>();
  let prev = -Infinity;
  for (const e of [...ends].sort((a, b) => y(a.v) - y(b.v))) {
    const ly = Math.max(y(e.v), prev + 14);
    placed.set(e.s.key, ly);
    prev = ly;
  }

  const hovered = hover !== null ? history[hover] : null;
  const tipLeft = hover !== null ? (x(hover) / W) * 100 : 0;

  return (
    <div className="viz">
      <ul className="viz-legend" aria-hidden="true">
        {SERIES.map((s) => (
          <li key={s.key}>
            <span className="viz-key" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="viz-frame" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Qloo taste match for movie, dinner and playlist across your last ${history.length} plans`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="viz-grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
              <text className="viz-tick" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">
                {pct(t)}
              </text>
            </g>
          ))}
          {history.map((h, i) =>
            i === 0 || i === last || history.length <= 10 || i % Math.ceil(history.length / 8) === 0 ? (
              <text key={i} className="viz-tick" x={x(i)} y={H - 12} textAnchor="middle">
                {i + 1}
                {h.duo ? "♥" : ""}
              </text>
            ) : null,
          )}
          <text className="viz-tick" x={PAD.left + plotW / 2} y={H - 0} textAnchor="middle">
            plan (♥ = date night)
          </text>
          {hover !== null ? <line className="viz-crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} /> : null}
          {SERIES.map((s) =>
            segments(s.key).map((d, j) => <path key={`${s.key}-${j}`} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />),
          )}
          {SERIES.map((s) =>
            history.map((h, i) => {
              const v = h[s.key]?.match;
              return v === undefined ? null : (
                <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 5.5 : 4} fill={s.color} className="viz-dot" />
              );
            }),
          )}
          {ends.map((e) => (
            <g key={e.s.key}>
              <line className="viz-leader" x1={x(last) + 6} x2={x(last) + 12} y1={y(e.v)} y2={placed.get(e.s.key)!} />
              <text className="viz-label" x={x(last) + 14} y={placed.get(e.s.key)! + 4}>
                {e.s.label} {pct(e.v)}
              </text>
            </g>
          ))}
          {/* Hit targets: one full-height band per plan, wider than any mark. */}
          {history.map((_, i) => {
            const half = history.length > 1 ? plotW / (history.length - 1) / 2 : plotW / 2;
            return (
              <rect
                key={i}
                x={x(i) - half}
                y={PAD.top}
                width={half * 2}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                aria-label={`Plan ${i + 1}`}
              />
            );
          })}
        </svg>
        {hovered ? (
          <div className="viz-tip" style={{ left: `${tipLeft}%` }} role="status">
            <p className="viz-tip-title">
              Plan {hover! + 1} · {new Date(hovered.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              {hovered.duo ? " · date night" : ""}
              {hovered.kind === "replan" ? " · re-plan" : ""}
            </p>
            <p className="viz-tip-prompt">“{hovered.prompt}”</p>
            {SERIES.map((s) =>
              hovered[s.key] ? (
                <p key={s.key} className="viz-tip-row">
                  <span className="viz-key" style={{ background: s.color }} />
                  <span>{hovered[s.key]!.name}</span>
                  <strong>{pct(hovered[s.key]!.match)}</strong>
                </p>
              ) : null,
            )}
          </div>
        ) : null}
      </div>
      <details className="viz-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Prompt</th>
              {SERIES.map((s) => (
                <th key={s.key}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i}>
                <td>
                  {i + 1}
                  {h.duo ? " ♥" : ""}
                </td>
                <td>{h.prompt}</td>
                {SERIES.map((s) => (
                  <td key={s.key}>{h[s.key] ? `${h[s.key]!.name} · ${pct(h[s.key]!.match)}` : "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
