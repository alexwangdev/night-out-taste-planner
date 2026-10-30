import type { Candidate, QlooEntityType, QlooTag } from "../types.js";

/** Host issued with the hackathon key; QLOO_BASE_URL can override it. */
export const DEFAULT_QLOO_BASE_URL = "https://hackathon.api.qloo.com";
const TIMEOUT_MS = 12_000;
const MAX_429_RETRIES = 2;

/** Safe to show or log: never contains the key or the raw provider body. */
export class QlooError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "QlooError";
  }
}

type Params = Record<string, string | number | undefined>;

function config() {
  const key = process.env.QLOO_API_KEY?.trim();
  if (!key) throw new QlooError("QLOO_API_KEY is not set");
  const base = (process.env.QLOO_BASE_URL?.trim() || DEFAULT_QLOO_BASE_URL).replace(/\/+$/, "");
  return { key, base };
}

export async function qlooGet(path: string, params: Params): Promise<any> {
  const { key, base } = config();
  const url = new URL(base + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  let res: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, {
        headers: { "X-Api-Key": key, accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "network error";
      throw new QlooError(`Qloo ${path} ${reason}`);
    }
    // The hackathon key is rate limited; back off briefly and retry a couple of times.
    if (res.status !== 429 || attempt >= MAX_429_RETRIES) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 800 * (attempt + 1);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  if (!res.ok) {
    // Read a short snippet for local diagnosis only; callers must not forward it to the browser.
    const snippet = (await res.text().catch(() => "")).slice(0, 200).replace(/\s+/g, " ");
    throw new QlooError(`Qloo ${path} returned HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`, res.status);
  }
  return res.json();
}

/** Qloo has returned results both as `results: [...]` and `results: { entities: [...] }`. */
function entityList(body: any): any[] {
  const r = body?.results;
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.entities)) return r.entities;
  if (Array.isArray(r?.tags)) return r.tags;
  if (Array.isArray(body?.entities)) return body.entities;
  return [];
}

function toCandidate(e: any): Candidate | null {
  const id = e?.entity_id ?? e?.id;
  const name = e?.name;
  if (typeof id !== "string" || typeof name !== "string") return null;
  const p = e.properties ?? {};
  const level = Number(p.price_level ?? e.price_level);
  const description =
    typeof p.description === "string"
      ? p.description
      : Array.isArray(p.short_descriptions)
        ? p.short_descriptions.find((d: any) => d?.languages?.includes?.("en"))?.value
        : undefined;
  return {
    id,
    name,
    priceLevel: Number.isInteger(level) && level >= 1 && level <= 4 ? level : undefined,
    tags: Array.isArray(e.tags)
      ? e.tags.map((t: any) => t?.name).filter((n: unknown): n is string => typeof n === "string").slice(0, 12)
      : [],
    description: description ? String(description).slice(0, 280) : undefined,
    address: typeof p.address === "string" ? p.address : undefined,
    year: typeof p.release_year === "number" ? p.release_year : undefined,
    popularity: typeof e.popularity === "number" ? e.popularity : undefined,
  };
}

/** Find entities by name, e.g. "Paddington 2" as a movie. */
export async function searchEntities(query: string, type: QlooEntityType, take = 5): Promise<Candidate[]> {
  const body = await qlooGet("/search", { query, types: type, take });
  return entityList(body).map(toCandidate).filter((c): c is Candidate => c !== null);
}

/** Find tag IDs by name, e.g. "ramen" among place tags. */
export async function searchTags(query: string, parentType?: QlooEntityType, take = 10): Promise<QlooTag[]> {
  const body = await qlooGet("/v2/tags", {
    "filter.query": query,
    "filter.parents.types": parentType,
    take,
  });
  return entityList(body)
    .map((t: any): Partial<QlooTag> => ({ id: t?.id ?? t?.tag_id, name: t?.name, type: t?.type ?? t?.subtype }))
    .filter((t): t is QlooTag => typeof t.id === "string" && typeof t.name === "string");
}

export interface InsightsQuery {
  type: QlooEntityType;
  likedEntityIds?: string[];
  likedTagIds?: string[];
  /** Results must carry at least one of these tags (union). */
  requireAnyTagIds?: string[];
  excludeEntityIds?: string[];
  excludeTagIds?: string[];
  locationQuery?: string;
  take?: number;
}

const csv = (xs?: string[]) => (xs && xs.length ? xs.join(",") : undefined);

/** Recommendation candidates from Qloo Insights. */
export async function getInsights(q: InsightsQuery): Promise<Candidate[]> {
  const body = await qlooGet("/v2/insights/", {
    "filter.type": q.type,
    "signal.interests.entities": csv(q.likedEntityIds),
    "signal.interests.tags": csv(q.likedTagIds),
    "filter.tags": csv(q.requireAnyTagIds),
    "operator.filter.tags": q.requireAnyTagIds?.length ? "union" : undefined,
    "filter.exclude.entities": csv(q.excludeEntityIds),
    "filter.exclude.tags": csv(q.excludeTagIds),
    "filter.location.query": q.locationQuery,
    take: q.take ?? 15,
  });
  return entityList(body).map(toCandidate).filter((c): c is Candidate => c !== null);
}
