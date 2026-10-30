import { useState } from "react";
import type { TasteArea } from "../types";

/**
 * "Where in Toronto": Qloo heatmap bins drawn as squares on a plain projection (no map service).
 * Sequential encoding — one hue, darker = less, brighter = more of your taste — with a legend, the dinner
 * pick as a ringed pin, the hotspot labelled, and a hover readout per square.
 */
const W = 900;
const LAT_STEP = 0.01;
const LON_STEP = 0.015;

/** One-hue ramp from near the card surface to bright blue (sequential: light = more). */
function ramp(t: number) {
  const a = [0x2c, 0x33, 0x3d];
  const b = [0x9c, 0xc4, 0xf5];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function TasteMap({ area, duo }: { area?: TasteArea; duo: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!area?.bins.length) return null;

  const lats = area.bins.map((b) => b.lat);
  const lons = area.bins.map((b) => b.lon);
  const minLat = Math.min(...lats) - LAT_STEP / 2;
  const maxLat = Math.max(...lats) + LAT_STEP / 2;
  const minLon = Math.min(...lons) - LON_STEP / 2;
  const maxLon = Math.max(...lons) + LON_STEP / 2;
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180); // keep east–west distances true
  const spanX = (maxLon - minLon) * k;
  const spanY = maxLat - minLat;
  const scale = W / spanX;
  const H = Math.round(spanY * scale);
  const px = (lon: number) => (lon - minLon) * k * scale;
  const py = (lat: number) => (maxLat - lat) * scale;
  const cellW = LON_STEP * k * scale;
  const cellH = LAT_STEP * scale;

  const hovered = hover !== null ? area.bins[hover] : null;
  const who = duo ? "both of your tastes" : "your taste";

  return (
    <section className="taste-map" aria-label="Where in Toronto your taste lives">
      <div className="taste-map-head">
        <h2>Where in Toronto</h2>
        <p className="section-note">
          {area.name ? (
            <>
              {duo ? "Your two tastes overlap most" : "Your taste concentrates"} around <strong>{area.name}</strong>
            </>
          ) : (
            `Where ${who} concentrates`
          )}
          {area.pick ? ` · dinner at ${area.pick.name} scores ${Math.round(area.pick.score * 100)}% here` : ""}. From Qloo's taste heatmap
          {duo ? ", keeping the lower of your two scores" : ""}.
        </p>
      </div>
      <div className="viz-frame taste-map-frame" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of Toronto shaded by how strongly ${who} concentrates in each area${area.name ? `; strongest around ${area.name}` : ""}`}>
          {area.bins.map((b, i) => (
            <rect
              key={i}
              x={px(b.lon - LON_STEP / 2) + 1}
              y={py(b.lat + LAT_STEP / 2) + 1}
              width={cellW - 2}
              height={cellH - 2}
              rx={2}
              fill={ramp(b.score)}
              stroke={hover === i ? "var(--cream)" : "none"}
              onMouseEnter={() => setHover(i)}
            />
          ))}
          {area.pick ? (
            <g>
              <circle cx={px(area.pick.lon)} cy={py(area.pick.lat)} r={9} fill="var(--cream)" stroke="var(--card)" strokeWidth={3} />
              <text className="viz-label" x={px(area.pick.lon) + 14} y={py(area.pick.lat) + 4}>
                {area.pick.name}
              </text>
            </g>
          ) : null}
          {area.name ? (
            <text className="viz-value" x={px(area.best.lon)} y={py(area.best.lat) + cellH + 16} textAnchor="middle">
              {area.name}
            </text>
          ) : null}
          <text className="viz-tick" x={W / 2} y={H - 6} textAnchor="middle">
            Lake Ontario ↓
          </text>
        </svg>
        {hovered ? (
          <div className="viz-tip" style={{ left: `${(px(hovered.lon) / W) * 100}%`, top: `${(py(hovered.lat) / H) * 100}%` }} role="status">
            <p className="viz-tip-row">
              <span className="viz-key" style={{ background: ramp(hovered.score) }} />
              <span>Taste here</span>
              <strong>{Math.round(hovered.score * 100)}%</strong>
            </p>
            <p className="viz-tip-prompt">
              {hovered.lat.toFixed(3)}, {hovered.lon.toFixed(3)}
            </p>
          </div>
        ) : null}
      </div>
      <div className="taste-map-legend" aria-hidden="true">
        <span>less</span>
        <span className="taste-map-ramp" style={{ background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.5)}, ${ramp(1)})` }} />
        <span>more {duo ? "of both your tastes" : "of your taste"}</span>
        {area.pick ? (
          <>
            <span className="taste-map-pin" /> <span>dinner pick</span>
          </>
        ) : null}
      </div>
    </section>
  );
}
