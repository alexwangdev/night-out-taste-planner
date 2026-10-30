import { GroundingBars } from "./GroundingBars";
import type { Thumb } from "./PlanCard";
import { TasteHistoryChart } from "./TasteHistoryChart";
import { STORAGE_KEY } from "../storage";
import { CATEGORIES, type Category, type Feedback, type FeedbackItem, type HistoryPoint, type PlanResponse, type TasteMemory, type TasteProfile } from "../types";

const LABELS: Record<Category, string> = { movie: "Movies", dinner: "Dinner spots", playlist: "Artists" };

interface Props {
  prompt: string;
  feedback: Feedback;
  result: PlanResponse | null;
  thumbs: Record<Category, Thumb>;
  budgetOverride?: number;
  profiles: TasteProfile[];
  isCustom: boolean;
  duo?: boolean;
  memory?: TasteMemory;
  history: HistoryPoint[];
  onClearHistory: () => void;
  onForgetNote: (i: number) => void;
  onForgetMemory: () => void;
  onRemove: (kind: "liked" | "disliked", id: string) => void;
  onReset: () => void;
}

function ItemList({ items, kind, onRemove }: { items: FeedbackItem[]; kind: "liked" | "disliked"; onRemove: Props["onRemove"] }) {
  if (!items.length) return <p className="empty">Nothing yet.</p>;
  return (
    <div className="saved-groups">
      {CATEGORIES.map((cat) => {
        const inCat = items.filter((i) => i.category === cat);
        if (!inCat.length) return null;
        return (
          <div key={cat}>
            <h3>{LABELS[cat]}</h3>
            <ul className="saved-items">
              {inCat.map((i) => (
                <li key={i.id}>
                  <span>{i.name}</span>
                  <button type="button" className="link-button" onClick={() => onRemove(kind, i.id)} aria-label={`Remove ${i.name}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function storedBytes(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? new Blob([raw]).size : 0;
  } catch {
    return null;
  }
}

export function SavedPage(props: Props) {
  const { prompt, feedback, result, thumbs, budgetOverride } = props;
  const plan = result?.plan;
  const bytes = storedBytes();
  const thumbLabel = (t: Thumb) => (t === "up" ? " · 👍 kept" : t === "down" ? " · 👎 marked to replace" : "");
  let stored: unknown = null;
  try {
    stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    stored = null;
  }

  return (
    <main className="page saved-page">
      <a href="#/" className="back">
        ← Back to planner
      </a>
      <h1>Saved in this browser</h1>
      <p className="subtitle">
        This is everything Cozy Night Planner keeps on this computer. It lives only in this browser's local storage — nothing is saved on
        the server, and other computers or browsers have their own.
      </p>

      <section className="saved-section">
        <h2>Taste match over your plans ({props.history.length})</h2>
        <p className="section-note">
          Qloo's affinity of each pick to your taste (date nights: the lower of your two scores), for your last plans in this browser.
        </p>
        <TasteHistoryChart history={props.history} />
        {props.history.length ? (
          <button type="button" className="link-button" onClick={props.onClearHistory}>
            Clear history
          </button>
        ) : null}
      </section>

      <section className="saved-section">
        <h2>How grounding compares</h2>
        <p className="section-note">Not your data — a measured comparison of NVIDIA Nemotron on its own against this app on the same requests.</p>
        <GroundingBars />
      </section>

      <section className="saved-section">
        <h2>Taste profile{props.profiles.length > 1 ? "s" : ""}</h2>
        {props.profiles.length ? (
          props.profiles.map((p, i) => (
            <div key={i} className="saved-profile">
              <h3>
                {i === 0 ? "Your taste" : "Your partner's taste"}
                {i === 0 && !props.isCustom ? " · built-in demo" : ""}
              </h3>
              <p className="section-note">
                Movies: {p.likedMovies.map((x) => x.name).join(", ") || "—"} · Artists: {p.likedArtists.map((x) => x.name).join(", ") || "—"} · Food:{" "}
                {p.likedFoods.map((x) => x.name).join(", ") || "—"}
                {p.dislikedMovieTags.length + p.dislikedPlaceTags.length
                  ? ` · Not into: ${[...p.dislikedMovieTags, ...p.dislikedPlaceTags].map((x) => x.name).join(", ")}`
                  : ""}
              </p>
            </div>
          ))
        ) : (
          <p className="empty">Using the cozy demo taste.</p>
        )}
      </section>

      <section className="saved-section">
        <h2>Taste memory ({props.memory?.notes.length ?? 0})</h2>
        <p className="section-note">
          Written by {props.memory?.model ?? "Nemotron"} from your thumbs after at least 3, and sent with each plan. Forgotten notes stay gone
          until your thumbs change.
        </p>
        {props.memory?.notes.length ? (
          <>
            <ul className="saved-items">
              {props.memory.notes.map((n, i) => (
                <li key={i}>
                  <span>
                    {n.text}
                    <span className="g-small"> · based on {n.basedOn.join(", ")}</span>
                  </span>
                  <button type="button" className="link-button" onClick={() => props.onForgetNote(i)}>
                    Forget
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="link-button" onClick={props.onForgetMemory}>
              Forget all memory
            </button>
          </>
        ) : (
          <p className="empty">Nothing yet — give a few thumbs up or down.</p>
        )}
      </section>

      <section className="saved-section">
        <h2>Thumbs up ({feedback.liked.length})</h2>
        <p className="section-note">Sent with every plan as extra taste signals, on top of the starting profile.</p>
        <ItemList items={feedback.liked} kind="liked" onRemove={props.onRemove} />
      </section>

      <section className="saved-section">
        <h2>Thumbs down ({feedback.disliked.length})</h2>
        <p className="section-note">Never picked again while saved here.</p>
        <ItemList items={feedback.disliked} kind="disliked" onRemove={props.onRemove} />
      </section>

      <section className="saved-section">
        <h2>Last plan</h2>
        {prompt ? <p className="saved-prompt">“{prompt}”</p> : <p className="empty">No prompt saved.</p>}
        {budgetOverride !== undefined ? <p className="section-note">Dinner budget raised to ${budgetOverride} CAD.</p> : null}
        {plan ? (
          <ul className="saved-plan">
            <li>
              <span className="card-label">Movie</span> {plan.movie.ok ? plan.movie.card.name : "— needs a retry"}
              {thumbLabel(thumbs.movie)}
            </li>
            <li>
              <span className="card-label">Dinner</span>{" "}
              {plan.dinner.ok ? `${plan.dinner.card.name} (est. $${plan.dinner.card.estimatedCostCad} CAD)` : "— needs a retry"}
              {thumbLabel(thumbs.dinner)}
            </li>
            <li>
              <span className="card-label">Playlist</span>{" "}
              {plan.playlist.ok ? `${plan.playlist.card.title}: ${plan.playlist.card.artists.map((a) => a.name).join(", ")}` : "— needs a retry"}
              {thumbLabel(thumbs.playlist)}
            </li>
          </ul>
        ) : (
          <p className="empty">No plan saved.</p>
        )}
      </section>

      <section className="saved-section">
        <h2>Raw data</h2>
        <p className="section-note">
          Key <code>{STORAGE_KEY}</code>
          {bytes === null ? " · storage is blocked in this browser, so nothing is kept after you leave" : ` · ${(bytes / 1024).toFixed(1)} KB`}
        </p>
        <details>
          <summary>Show stored JSON</summary>
          <pre>{JSON.stringify(stored, null, 2)}</pre>
        </details>
      </section>

      <div className="saved-actions">
        <button type="button" className="secondary" onClick={props.onReset}>
          Reset to starting profile
        </button>
        <span className="section-note">Clears everything above and goes back to the seeded cozy-night taste.</span>
      </div>
    </main>
  );
}
