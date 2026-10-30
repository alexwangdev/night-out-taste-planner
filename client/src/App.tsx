import { useEffect, useState } from "react";
import { ApiError, fetchPresets, requestMemory, requestPlan, requestReplan, requestTaste } from "./api/client";
import { AgentTrace } from "./components/AgentTrace";
import { ExamplePrompts } from "./components/ExamplePrompts";
import { GroundingPage } from "./components/GroundingPage";
import { PlanCard, RETRY_MESSAGE, type Thumb } from "./components/PlanCard";
import { MoodChips } from "./components/MoodChips";
import { ProfileBuilder } from "./components/ProfileBuilder";
import { PromptForm } from "./components/PromptForm";
import { SavedPage } from "./components/SavedPage";
import { TasteHeader } from "./components/TasteHeader";
import { TasteMap } from "./components/TasteMap";
import { clearSaved, HISTORY_LIMIT, loadSaved, save } from "./storage";
import {
  CATEGORIES,
  type Category,
  type Feedback,
  type FeedbackItem,
  type HistoryPoint,
  type Plan,
  type PlanResponse,
  type Overlap,
  type Presets,
  type TasteMemory,
  type TasteProfile,
  type TraceStep,
} from "./types";

const RATE_LIMIT_MESSAGE = "Too many plans in a short time. Please wait a moment, then try again.";
const NEUTRAL: Record<Category, Thumb> = { movie: null, dinner: null, playlist: null };

/** The Qloo entities a card stands for; a playlist stands for each of its artists. */
function itemsFor(plan: Plan, cat: Category): FeedbackItem[] {
  const slot = plan[cat];
  if (!slot.ok) return [];
  if (cat === "playlist") return (slot.card as { artists: { id: string; name: string }[] }).artists.map((a) => ({ ...a, category: cat }));
  const card = slot.card as { id: string; name: string };
  return [{ id: card.id, name: card.name, category: cat }];
}

type Busy = { kind: "plan" } | { kind: "replan"; categories: Category[] } | null;

export function App() {
  // Restored once from this browser's cache (storage.ts); every computer/browser has its own.
  const [saved] = useState(loadSaved);
  const [prompt, setPrompt] = useState(saved?.prompt ?? "");
  const [result, setResult] = useState<PlanResponse | null>(saved?.result ?? null);
  const [thumbs, setThumbs] = useState<Record<Category, Thumb>>(saved?.thumbs ?? NEUTRAL);
  /** This browser's taste updates, layered on the seeded profile (spec.md > Data Model). */
  const [feedback, setFeedback] = useState<Feedback>(saved?.feedback ?? { liked: [], disliked: [] });
  /** Set by "Raise budget to $X"; dropped as soon as the prompt text changes. */
  const [budgetOverride, setBudgetOverride] = useState<number | undefined>(saved?.budgetOverride);
  const [busy, setBusy] = useState<Busy>(null);
  /** The agent's steps for the plan in progress (live) or the last one (folded under the plan). */
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const onStep = (s: TraceStep) =>
    setTrace((t) => {
      const i = t.findIndex((x) => x.id === s.id);
      return i < 0 ? [...t, s] : t.map((x, j) => (j === i ? s : x));
    });
  /** Preset personas (with Qloo IDs) from the API; until they load the server uses the cozy default. */
  const [presets, setPresets] = useState<Presets | null>(null);
  const [me, setMe] = useState<TasteProfile | undefined>(saved?.me);
  const [partner, setPartner] = useState<TasteProfile | undefined>(saved?.partner);
  const [duo, setDuo] = useState<boolean>(saved?.duo ?? false);
  /** Qloo taste-match scores of recent plans, for the saved-page chart. */
  const [history, setHistory] = useState<HistoryPoint[]>(saved?.history ?? []);
  function record(r: PlanResponse, kind: HistoryPoint["kind"], text: string) {
    const pick = <T extends { affinity?: number }>(slot: { ok: boolean; card?: T }, name: (c: T) => string) =>
      slot.ok && slot.card && slot.card.affinity !== undefined ? { name: name(slot.card), match: slot.card.affinity } : undefined;
    const point: HistoryPoint = {
      at: new Date().toISOString(),
      prompt: text,
      duo: activeProfiles.length > 1,
      kind,
      movie: pick(r.plan.movie as any, (c: any) => c.name),
      dinner: pick(r.plan.dinner as any, (c: any) => c.name),
      playlist: pick(r.plan.playlist as any, (c: any) => c.title),
    };
    if (point.movie || point.dinner || point.playlist) setHistory((h) => [...h, point].slice(-HISTORY_LIMIT));
  }
  /** Taste memory written by Nemotron from this browser's thumbs. */
  const [memory, setMemory] = useState<TasteMemory | undefined>(saved?.memory);
  const memoryNotes = memory?.notes.map((n) => n.text) ?? [];
  /** Which profile the taste builder is editing, if open. */
  const [building, setBuilding] = useState<0 | 1 | null>(null);
  useEffect(() => {
    // The API may be waking up (free hosting sleeps) — keep trying instead of giving up after one failure.
    let live = true;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      fetchPresets()
        .then((p) => live && setPresets(p))
        .catch(() => {
          if (!live) return;
          attempt += 1;
          timer = setTimeout(load, Math.min(15000, 2000 * attempt));
        });
    load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);
  /** Who the next plan is for. */
  const activeProfiles: TasteProfile[] = [me ?? presets?.cozy, ...(duo ? [partner ?? presets?.partner] : [])].filter(
    (p): p is TasteProfile => !!p,
  );
  const profilesForRequest = activeProfiles.length ? activeProfiles : undefined;

  // Qloo's "in a few words" per profile, and where two tastes meet — refreshed when the profiles change.
  const [tasteWords, setTasteWords] = useState<string[][] | undefined>(undefined);
  const [overlap, setOverlap] = useState<Overlap | undefined>(undefined);
  const profilesKey = activeProfiles.map((p) => [...p.likedMovies, ...p.likedArtists, ...p.likedFoods].map((x) => x.id).join(",")).join("|");
  useEffect(() => {
    if (!activeProfiles.length) return;
    let live = true;
    const t = setTimeout(() => {
      requestTaste(activeProfiles)
        .then((r) => {
          if (!live) return;
          setTasteWords(r.words);
          setOverlap(r.overlap);
        })
        .catch(() => {
          /* words are a nice-to-have */
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesKey]);
  /** Two views, switched by the URL hash so static hosting needs no rewrites: #/ (planner) and #/saved. */
  const viewFor = (hash: string) => (hash === "#/saved" ? "saved" : hash === "#/grounding" ? "grounding" : "plan");
  const [view, setView] = useState(() => viewFor(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      setView(viewFor(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    save({ prompt, feedback, result, thumbs, budgetOverride, me, partner, duo, memory, history });
  }, [prompt, feedback, result, thumbs, budgetOverride, me, partner, duo, memory, history]);

  // Refresh the taste memory a moment after the thumbs settle (at least 3), only if they changed.
  const feedbackKey = [...feedback.liked.map((i) => `+${i.id}`), ...feedback.disliked.map((i) => `-${i.id}`)].sort().join(",");
  useEffect(() => {
    const total = feedback.liked.length + feedback.disliked.length;
    if (total < 3 || memory?.key === feedbackKey) return;
    const t = setTimeout(() => {
      requestMemory(feedback)
        .then((r) => setMemory({ notes: r.notes, key: feedbackKey, model: r.model }))
        .catch(() => {
          /* memory is a nice-to-have; plans work without it */
        });
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackKey]);

  function resetProfile() {
    clearSaved();
    setPrompt("");
    setResult(null);
    setThumbs(NEUTRAL);
    setFeedback({ liked: [], disliked: [] });
    setBudgetOverride(undefined);
    setRequestError(null);
    setMe(undefined);
    setPartner(undefined);
    setDuo(false);
    setBuilding(null);
    setMemory(undefined);
    setHistory([]);
  }

  const ratedCount = feedback.liked.length + feedback.disliked.length;

  /** Forget one saved like/dislike; a card that showed that thumb goes back to neutral. */
  function removeItem(kind: "liked" | "disliked", id: string) {
    const nextFeedback = { ...feedback, [kind]: feedback[kind].filter((i) => i.id !== id) };
    setFeedback(nextFeedback);
    if (!result) return;
    setThumbs((t) => {
      const updated = { ...t };
      for (const cat of CATEGORIES) {
        const ids = itemsFor(result.plan, cat).map((i) => i.id);
        if (t[cat] === "up" && !nextFeedback.liked.some((i) => ids.includes(i.id))) updated[cat] = null;
        if (t[cat] === "down" && !nextFeedback.disliked.some((i) => ids.includes(i.id))) updated[cat] = null;
      }
      return updated;
    });
  }

  if (view === "grounding") return <GroundingPage />;

  if (view === "saved") {
    return (
      <SavedPage
        prompt={prompt}
        feedback={feedback}
        result={result}
        thumbs={thumbs}
        budgetOverride={budgetOverride}
        profiles={activeProfiles}
        isCustom={!!me}
        duo={duo}
        memory={memory}
        history={history}
        onClearHistory={() => setHistory([])}
        onForgetNote={(i) => setMemory((m) => (m ? { ...m, notes: m.notes.filter((_, j) => j !== i) } : m))}
        onForgetMemory={() => setMemory(memory ? { notes: [], key: memory.key } : undefined)}
        onRemove={removeItem}
        onReset={resetProfile}
      />
    );
  }

  const errorMessage = (err: unknown) => (err instanceof ApiError && err.kind === "rate_limited" ? RATE_LIMIT_MESSAGE : RETRY_MESSAGE);

  function changePrompt(text: string) {
    setPrompt(text);
    setBudgetOverride(undefined);
  }

  async function plan(text: string, budget = budgetOverride) {
    const p = text.trim();
    if (!p || busy) return;
    setBusy({ kind: "plan" });
    setRequestError(null);
    setTrace([]);
    try {
      const next = await requestPlan(p, feedback, budget, profilesForRequest, onStep, memoryNotes);
      setResult(next);
      record(next, "plan", p);
      setThumbs(NEUTRAL);
    } catch (err) {
      // Keep the prompt and any existing plan on screen.
      setRequestError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function replan(categories: Category[], budget = budgetOverride, excludeShown = true) {
    if (!result || busy || !categories.length || !prompt.trim()) return;
    setBusy({ kind: "replan", categories });
    setRequestError(null);
    setTrace([]);
    try {
      const next = await requestReplan(prompt.trim(), feedback, categories, result.plan, budget, excludeShown, result.mood, profilesForRequest, onStep, memoryNotes);
      // A re-plan that didn't touch dinner has no new map; keep the one on screen.
      const merged = { ...next, area: next.area ?? result.area, overlap: next.overlap ?? result.overlap };
      setResult(merged);
      record(merged, "replan", prompt.trim());
      // Replacement cards start neutral; liked and untouched cards keep their state.
      setThumbs((t) => ({ ...t, ...Object.fromEntries(categories.map((c) => [c, null])) }));
    } catch (err) {
      // A failed re-plan leaves the current plan exactly as it was.
      setRequestError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function rate(cat: Category, dir: "up" | "down") {
    if (!result) return;
    const next: Thumb = thumbs[cat] === dir ? null : dir;
    const items = itemsFor(result.plan, cat);
    const ids = new Set(items.map((i) => i.id));
    setFeedback((f) => ({
      liked: [...f.liked.filter((i) => !ids.has(i.id)), ...(next === "up" ? items : [])],
      disliked: [...f.disliked.filter((i) => !ids.has(i.id)), ...(next === "down" ? items : [])],
    }));
    setThumbs((t) => ({ ...t, [cat]: next }));
  }

  function raiseBudget(amount: number) {
    setBudgetOverride(amount);
    replan(["dinner"], amount, false);
  }

  const disliked = CATEGORIES.filter((c) => thumbs[c] === "down" && result?.plan[c].ok);
  const pendingCats = busy?.kind === "replan" ? busy.categories : [];

  return (
    <main className="page">
      <TasteHeader
        profiles={activeProfiles}
        loading={!presets}
        custom={[!!me, !!partner]}
        duo={duo}
        locked={!!busy}
        onBuild={(who) => setBuilding(who)}
        onUseDemo={(who) => (who === 0 ? setMe(undefined) : setPartner(undefined))}
        words={tasteWords}
        overlap={overlap}
        onToggleDuo={(on) => {
          setDuo(on);
          if (!on && building === 1) setBuilding(null);
        }}
      />
      {memory?.notes.length ? (
        <section className="memory" aria-label="What I've learned from your thumbs">
          <p className="memory-label">
            What I've learned from your thumbs <span className="trace-model">{memory.model ?? "Nemotron"}</span>
          </p>
          <ul>
            {memory.notes.map((n, i) => (
              <li key={i}>{n.text}</li>
            ))}
          </ul>
          <a href="#/saved" className="memory-link">
            Edit or forget
          </a>
        </section>
      ) : null}
      {building !== null ? (
        <ProfileBuilder
          key={building}
          title={building === 0 ? (me ? "Edit your taste" : "Your taste") : partner ? "Edit their taste" : "Their taste"}
          initial={
            (building === 0 ? me : partner) ?? { name: building === 0 ? "You" : "Your partner", likedMovies: [], likedArtists: [], likedFoods: [], dislikedMovieTags: [], dislikedPlaceTags: [] }
          }
          onSave={(p) => {
            if (building === 0) setMe({ ...p, name: "You" });
            else setPartner({ ...p, name: "Your partner" });
            setBuilding(null);
          }}
          onCancel={() => setBuilding(null)}
        />
      ) : null}
      <PromptForm value={prompt} busy={busy?.kind === "plan"} onChange={changePrompt} onSubmit={() => plan(prompt)} />

      <section className="results" aria-live="polite" aria-busy={!!busy}>
        {requestError ? (
          <div className="request-error" role="alert">
            <p>{requestError}</p>
            <button type="button" className="secondary" onClick={() => plan(prompt)} disabled={!!busy || !prompt.trim()}>
              Try again
            </button>
          </div>
        ) : null}

        {busy ? <AgentTrace steps={trace} live /> : null}

        {!result && !busy && !requestError ? (
          <ExamplePrompts
            onPick={(ex) => {
              changePrompt(ex);
              plan(ex, undefined);
            }}
          />
        ) : null}

        {result ? (
          <>
            {budgetOverride !== undefined ? (
              <p className="note">Dinner budget raised to ${budgetOverride} CAD.</p>
            ) : result.budgetAssumed ? (
              <p className="note">No budget mentioned, so I assumed ${result.budgetCad} CAD for dinner.</p>
            ) : null}
            <MoodChips mood={result.mood} />
            <div className="cards">
              {CATEGORIES.map((cat) => (
                <PlanCard
                  key={cat}
                  {...({ category: cat, slot: result.plan[cat] } as any)}
                  thumb={thumbs[cat]}
                  pending={pendingCats.includes(cat)}
                  locked={!!busy}
                  onThumb={(dir: "up" | "down") => rate(cat, dir)}
                  onRetry={() => replan([cat])}
                  onRaiseBudget={cat === "dinner" ? raiseBudget : undefined}
                />
              ))}
            </div>
            <TasteMap area={result.area} duo={!!result.plan.dinner.ok && !!(result.plan.dinner.card as any).matches?.length} />
            {!busy ? <AgentTrace steps={trace} live={false} /> : null}
            {disliked.length ? (
              <div className="replan-bar">
                <button type="button" className="plan-button" disabled={!!busy} onClick={() => replan(disliked)}>
                  {busy?.kind === "replan" ? "Re-planning…" : "Re-plan"}
                </button>
                <p className="hint">
                  Replaces only the {disliked.join(" and ")} pick{disliked.length > 1 ? "s" : ""}; everything else stays.
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <footer className="footer">
        <p className="footer-links">
          <a href="#/grounding">Why grounding matters: Nemotron alone vs. Qloo-grounded</a>
        </p>
        {ratedCount || result || me || partner ? (
          <p>
            Your taste, thumbs-up/down, and last plan are saved in this browser only. <a href="#/saved">See what's saved</a> ·{" "}
            <button type="button" className="link-button" onClick={resetProfile} disabled={!!busy}>
              Reset to starting profile
            </button>
          </p>
        ) : (
          <p>
            Nothing saved yet. Thumbs and plans stay in this browser only. <a href="#/saved">See what's saved</a>
          </p>
        )}
      </footer>
    </main>
  );
}
