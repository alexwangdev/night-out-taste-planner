import type { Overlap, TasteProfile } from "../types";

/** "Where your tastes meet": Qloo's compare analysis of the two profiles. */
function OverlapPanel({ overlap }: { overlap: Overlap }) {
  if (!overlap.shared.length && !overlap.youLean.length) return null;
  return (
    <section className="overlap" aria-label="Where your tastes meet">
      <p className="overlap-title">Where your tastes meet</p>
      {overlap.shared.length ? (
        <ul className="overlap-shared">
          {overlap.shared.map((s) => (
            <li key={s.name} title={`You: ${s.you.join(", ") || "—"} · Your partner: ${s.partner.join(", ") || "—"}`}>
              <strong>{s.name}</strong>
              <span>
                {s.you[0] ?? "you"} ↔ {s.partner[0] ?? "your partner"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {overlap.youLean.length || overlap.partnerLeans.length ? (
        <p className="overlap-diff">
          {overlap.youLean.length ? <>You lean {overlap.youLean.join(", ").toLowerCase()}</> : null}
          {overlap.youLean.length && overlap.partnerLeans.length ? "; " : null}
          {overlap.partnerLeans.length ? <>your partner leans {overlap.partnerLeans.join(", ").toLowerCase()}</> : null}.
        </p>
      ) : null}
      <p className="overlap-source">From Qloo's taste comparison of your favourites.</p>
    </section>
  );
}

/** A few chips summarising one profile (prd.md > Screens and Layout). */
function ProfileChips({ profile }: { profile: TasteProfile }) {
  const likes = [profile.likedMovies[0], profile.likedArtists[0], profile.likedFoods[0], profile.likedMovies[1], profile.likedArtists[1]]
    .filter(Boolean)
    .slice(0, 4);
  const dislikes = [...profile.dislikedMovieTags, ...profile.dislikedPlaceTags].slice(0, 2);
  return (
    <ul className="chips" aria-label="Taste">
      {likes.map((l) => (
        <li key={l.id} className="chip chip-like">
          <span aria-hidden="true">♥</span> {l.name}
        </li>
      ))}
      {dislikes.map((d) => (
        <li key={d.id} className="chip chip-dislike">
          <span aria-hidden="true">✕</span> <span className="sr-only">not into </span>
          {d.name}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  /** Profiles the next plan is for; empty while presets load. */
  profiles: TasteProfile[];
  /** Which of those profiles are someone's own (not a demo preset). */
  custom: boolean[];
  duo: boolean;
  locked: boolean;
  onBuild: (who: 0 | 1) => void;
  onUseDemo: (who: 0 | 1) => void;
  onToggleDuo: (on: boolean) => void;
  /** Qloo's few words for each profile (same order as profiles). */
  words?: string[][];
  overlap?: Overlap;
}

export function TasteHeader({ profiles, custom, duo, locked, onBuild, onUseDemo, onToggleDuo, words, overlap }: Props) {
  return (
    <header className="header">
      <h1>Cozy Night Planner</h1>
      <p className="subtitle">One prompt plans your whole evening, from your taste.</p>
      <div className="mode-toggle" role="group" aria-label="Who is the evening for">
        <button type="button" className={!duo ? "selected" : ""} aria-pressed={!duo} disabled={locked} onClick={() => onToggleDuo(false)}>
          Just me
        </button>
        <button type="button" className={duo ? "selected" : ""} aria-pressed={duo} disabled={locked} onClick={() => onToggleDuo(true)}>
          Date night for two
        </button>
      </div>
      {profiles.map((p, i) => {
        const who = i as 0 | 1;
        return (
          <div className="profile-row" key={i}>
            <p className="profile-name">
              <strong>{i === 0 ? "Your taste" : "Your partner's taste"}</strong>
              {!custom[i] ? <span className="profile-tag">demo</span> : null}
            </p>
            <ProfileChips profile={p} />
            {words?.[i]?.length ? (
              <p className="taste-words">
                <span>In a few words</span> {words[i].join(" · ")}
              </p>
            ) : null}
            <p className="profile-actions">
              <button type="button" className="link-button" onClick={() => onBuild(who)} disabled={locked}>
                {custom[i] ? (i === 0 ? "Edit my taste" : "Edit their taste") : i === 0 ? "Use my taste" : "Use their taste"}
              </button>
              {custom[i] ? (
                <>
                  {" · "}
                  <button type="button" className="link-button" onClick={() => onUseDemo(who)} disabled={locked}>
                    {i === 0 ? "Switch to the demo taste" : "Switch to the demo partner"}
                  </button>
                </>
              ) : null}
            </p>
          </div>
        );
      })}
      {duo && overlap ? <OverlapPanel overlap={overlap} /> : null}
    </header>
  );
}
