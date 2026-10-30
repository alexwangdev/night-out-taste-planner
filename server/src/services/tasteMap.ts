import type { Candidate, TasteProfile } from "../types.js";
import { qlooGet } from "./qloo.js";

/**
 * "Where in Toronto": Qloo heatmaps (filter.type=urn:heatmap) score ~6,000 small cells of the city by how much
 * each person's taste concentrates there. We average them into ~1 km bins, take the lower of two people's
 * scores on date night, and name the best area from the neighbourhoods of nearby Qloo restaurants.
 */

/** Bin size in degrees: ~1.1 km north–south, ~1.2 km east–west at Toronto's latitude. */
const LAT_STEP = 0.01;
const LON_STEP = 0.015;

export interface MapBin {
  lat: number;
  lon: number;
  /** 0–1, relative to the best bin in this map. */
  score: number;
}

export interface TasteMap {
  bins: MapBin[];
  best: { lat: number; lon: number };
}

const binKey = (lat: number, lon: number) => `${Math.floor(lat / LAT_STEP)}:${Math.floor(lon / LON_STEP)}`;

const cache = new Map<string, { at: number; value: Map<string, { lat: number; lon: number; sum: number; n: number }> }>();

async function personBins(p: TasteProfile, city: string) {
  const k = `${city}:${[...p.likedMovies, ...p.likedArtists, ...p.likedFoods].map((x) => x.id).sort().join(",")}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.value;
  const body = await qlooGet(
    "/v2/insights/",
    {
      "filter.type": "urn:heatmap",
      "filter.location.query": city,
      "signal.interests.entities": [...p.likedMovies, ...p.likedArtists].map((x) => x.id).join(",") || undefined,
      "signal.interests.tags": p.likedFoods.map((f) => f.id).join(",") || undefined,
    },
    10_000,
  );
  const bins = new Map<string, { lat: number; lon: number; sum: number; n: number }>();
  for (const c of body?.results?.heatmap ?? []) {
    const lat = Number(c?.location?.latitude);
    const lon = Number(c?.location?.longitude);
    const a = Number(c?.query?.affinity);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(a)) continue;
    const kk = binKey(lat, lon);
    const b = bins.get(kk) ?? { lat: (Math.floor(lat / LAT_STEP) + 0.5) * LAT_STEP, lon: (Math.floor(lon / LON_STEP) + 0.5) * LON_STEP, sum: 0, n: 0 };
    b.sum += a;
    b.n += 1;
    bins.set(kk, b);
  }
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  cache.set(k, { at: Date.now(), value: bins });
  return bins;
}

/** One taste map for one or two people (two: each bin keeps the lower of the two scores). */
export async function tasteMap(profiles: TasteProfile[], city: string): Promise<TasteMap | null> {
  const per = await Promise.all(profiles.map((p) => personBins(p, city)));
  const keys = [...per[0].keys()].filter((k) => per.every((m) => m.has(k)));
  if (!keys.length) return null;
  const raw = keys.map((k) => {
    const b = per[0].get(k)!;
    return { lat: b.lat, lon: b.lon, v: Math.min(...per.map((m) => m.get(k)!.sum / m.get(k)!.n)) };
  });
  const max = Math.max(...raw.map((r) => r.v)) || 1;
  const bins = raw.map((r) => ({ lat: +r.lat.toFixed(4), lon: +r.lon.toFixed(4), score: +(r.v / max).toFixed(3) }));
  const top = [...bins].sort((a, b) => b.score - a.score)[0];
  return { bins, best: { lat: top.lat, lon: top.lon } };
}

/** The map's score where a place sits (0 if outside the mapped area). */
export function scoreAt(map: TasteMap, lat?: number, lon?: number): number {
  if (lat === undefined || lon === undefined) return 0;
  const b = map.bins.find((x) => Math.abs(x.lat - lat) <= LAT_STEP / 2 + 1e-9 && Math.abs(x.lon - lon) <= LON_STEP / 2 + 1e-9);
  return b?.score ?? 0;
}

const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const dy = (aLat - bLat) * 111;
  const dx = (aLon - bLon) * 111 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

/**
 * Name the taste hotspot: the neighbourhood of the Qloo restaurant nearest to the best-scoring bins
 * (within 1.5 km). Returns undefined rather than guessing a name.
 */
export function nameHotspot(map: TasteMap, places: Candidate[]): string | undefined {
  const topBins = [...map.bins].sort((a, b) => b.score - a.score).slice(0, 5);
  let best: { name: string; d: number } | undefined;
  for (const bin of topBins) {
    for (const p of places) {
      if (p.lat === undefined || p.lon === undefined || !p.neighborhood) continue;
      const d = km(bin.lat, bin.lon, p.lat, p.lon);
      if (d <= 1.5 && (!best || d < best.d)) best = { name: p.neighborhood, d };
    }
    if (best) break;
  }
  return best?.name;
}
