import type { ActionLink, Category, DinnerCard, MovieCard, PersonMatch, PlaylistCard, Slot } from "../types";

export const RETRY_MESSAGE = "Couldn't reach the taste service right now — your prompt is still here, just try again.";

export type Thumb = "up" | "down" | null;

const LABELS: Record<Category, string> = { movie: "Movie", dinner: "Dinner", playlist: "Playlist" };

type Content =
  | { category: "movie"; slot: Slot<MovieCard> }
  | { category: "dinner"; slot: Slot<DinnerCard> }
  | { category: "playlist"; slot: Slot<PlaylistCard> };

type Props = Content & {
  thumb: Thumb;
  /** This card is being regenerated right now. */
  pending: boolean;
  /** Any request is in flight; controls are disabled. */
  locked: boolean;
  onThumb: (dir: "up" | "down") => void;
  onRetry: () => void;
  onRaiseBudget?: (budgetCad: number) => void;
};

/** Qloo's affinity score, shown so people can see the taste graph at work. */
export function Match({ affinity, matches, forBoth }: { affinity?: number; matches?: PersonMatch[]; forBoth?: boolean }) {
  if (matches && matches.length > 1) {
    return (
      <span className={`match${forBoth ? " match-both" : ""}`} title="Qloo taste-graph affinity for each person">
        {forBoth ? "For both · " : ""}
        {matches.map((m, i) => `${i === 0 ? "You" : "Partner"} ${m.affinity === undefined ? "–" : `${Math.round(m.affinity * 100)}%`}`).join(" · ")}
      </span>
    );
  }
  if (affinity === undefined) return null;
  return (
    <span className="match" title="Qloo taste-graph affinity to your profile">
      {Math.round(affinity * 100)}% taste match
    </span>
  );
}

function MoodMatch({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  return <p className="mood-match">Fits the mood: {[...new Set(names)].slice(0, 3).join(" · ")}</p>;
}

/** Average each person's Qloo match across the playlist's artists. */
function playlistMatches(c: PlaylistCard): PersonMatch[] | undefined {
  const first = c.artists[0]?.matches;
  if (!first || first.length < 2) return undefined;
  return first.map((m, i) => {
    const scores = c.artists.map((a) => a.matches?.[i]?.affinity).filter((x): x is number => x !== undefined);
    return { name: m.name, affinity: scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : undefined };
  });
}

function Links({ links }: { links?: ActionLink[] }) {
  // Plans saved by an older version have no links.
  if (!links?.length) return null;
  return (
    <p className="links">
      {links.map((l) => (
        <a key={l.label} href={l.url} target={l.url.startsWith("tel:") ? undefined : "_blank"} rel="noopener noreferrer">
          {l.label}
        </a>
      ))}
    </p>
  );
}

function Cover({ src, alt, shape }: { src?: string; alt: string; shape: "poster" | "photo" }) {
  if (!src) return null;
  return <img className={`cover cover-${shape}`} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" />;
}

function DinnerCost({ card, locked, onRaiseBudget }: { card: DinnerCard; locked: boolean; onRaiseBudget?: (b: number) => void }) {
  const over = card.estimatedCostCad - card.budgetCad;
  return (
    <div className="cost-block">
      <p className="cost">
        <span className={`badge${card.overBudget ? " badge-over" : ""}`}>Est. ${card.estimatedCostCad} CAD</span>
        <span className="cost-note">
          {card.overBudget ? `estimated $${over} over your $${card.budgetCad} budget` : `fits your $${card.budgetCad} budget`} · meal for one,
          before tip
        </span>
      </p>
      {card.overBudget && onRaiseBudget ? (
        <>
          <p className="over-note">Nothing priced fit your budget, so this is the closest match.</p>
          <button type="button" className="secondary" disabled={locked} onClick={() => onRaiseBudget(card.estimatedCostCad)}>
            Raise budget to ${card.estimatedCostCad} CAD and re-plan
          </button>
        </>
      ) : null}
    </div>
  );
}

function Body(props: Props) {
  if (props.category === "movie" && props.slot.ok) {
    const c = props.slot.card;
    return (
      <>
        <Cover src={c.image} alt={`${c.name} poster`} shape="poster" />
        <h2 className="pick">
          {c.name}
          {c.year ? <span className="year"> ({c.year})</span> : null}
        </h2>
        <Match affinity={c.affinity} matches={c.matches} forBoth={c.forBoth} />
        <p className="reason">{c.reason}</p>
        <MoodMatch names={c.moodMatches} />
        <p className="meta">Streaming at home · $0</p>
        <Links links={c.links} />
      </>
    );
  }
  if (props.category === "dinner" && props.slot.ok) {
    const c = props.slot.card;
    return (
      <>
        <Cover src={c.image} alt={`${c.name}`} shape="photo" />
        <h2 className="pick">{c.name}</h2>
        <Match affinity={c.affinity} matches={c.matches} forBoth={c.forBoth} />
        <p className="meta">
          {[c.neighborhood, c.rating ? `★ ${c.rating.toFixed(1)}` : null].filter(Boolean).join(" · ")}
          {c.address ? <span className="address">{c.address}</span> : null}
        </p>
        <p className="reason">{c.reason}</p>
        <MoodMatch names={c.moodMatches} />
        {c.areaScore !== undefined ? <p className="mood-match">Taste-map score for this area: {Math.round(c.areaScore * 100)}%</p> : null}
        <Links links={c.links} />
        <DinnerCost card={c} locked={props.locked} onRaiseBudget={props.onRaiseBudget} />
      </>
    );
  }
  if (props.category === "playlist" && props.slot.ok) {
    const c = props.slot.card;
    return (
      <>
        <h2 className="pick">{c.title}</h2>
        <Match affinity={c.affinity} matches={playlistMatches(c)} forBoth={c.artists.length > 0 && c.artists.every((a) => a.forBoth)} />
        <ul className="artist-list">
          {c.artists.map((a) => {
            const spotify = (a.links ?? []).find((l) => l.label === "Spotify");
            return (
              <li key={a.id}>
                {a.image ? <img src={a.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="avatar-blank" aria-hidden="true" />}
                <span className="artist-name">{a.name}</span>
                {spotify ? (
                  <a href={spotify.url} target="_blank" rel="noopener noreferrer" aria-label={`${a.name} on Spotify`}>
                    Spotify
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="reason">{c.reason}</p>
        <MoodMatch names={c.moodMatches} />
        <p className="meta">Playlist · $0</p>
      </>
    );
  }
  return null;
}

export function PlanCard(props: Props) {
  const { category, slot, thumb, pending, locked } = props;
  const label = LABELS[category];
  const state = pending ? " is-pending" : thumb === "down" ? " is-disliked" : thumb === "up" ? " is-liked" : "";
  return (
    <article className={`card card-${category}${state}`} aria-label={label} aria-busy={pending}>
      <div className="card-top">
        <p className="card-label">{label}</p>
        {slot.ok ? (
          <div className="thumbs" role="group" aria-label={`Rate this ${label.toLowerCase()}`}>
            <button
              type="button"
              className={`thumb${thumb === "up" ? " selected" : ""}`}
              aria-pressed={thumb === "up"}
              aria-label={`Thumbs up: keep this ${label.toLowerCase()}`}
              disabled={locked}
              onClick={() => props.onThumb("up")}
            >
              👍
            </button>
            <button
              type="button"
              className={`thumb${thumb === "down" ? " selected" : ""}`}
              aria-pressed={thumb === "down"}
              aria-label={`Thumbs down: replace this ${label.toLowerCase()}`}
              disabled={locked}
              onClick={() => props.onThumb("down")}
            >
              👎
            </button>
          </div>
        ) : null}
      </div>

      {pending ? (
        <p className="card-pending">Finding a new {label.toLowerCase()}…</p>
      ) : slot.ok ? (
        <>
          <Body {...props} />
          {thumb === "down" ? <p className="flag">Will be replaced when you re-plan</p> : null}
          {thumb === "up" ? <p className="flag flag-keep">Kept — liked picks stay put</p> : null}
        </>
      ) : (
        <div className="card-error">
          <p>{RETRY_MESSAGE}</p>
          <button type="button" className="secondary" disabled={locked} onClick={props.onRetry}>
            Try again
          </button>
        </div>
      )}
    </article>
  );
}
