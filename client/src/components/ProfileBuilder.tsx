import { useEffect, useId, useRef, useState } from "react";
import { ApiError, requestTaste, searchTaste, snapTaste, type SnapResult } from "../api/client";
import type { Named, SearchResult, TasteProfile } from "../types";

const MAX_PICKS = 3;

type Kind = "movie" | "artist" | "food";
const FIELD: Record<Kind, { label: string; placeholder: string; key: "likedMovies" | "likedArtists" | "likedFoods" }> = {
  movie: { label: "Favourite movies", placeholder: "e.g. Knives Out", key: "likedMovies" },
  artist: { label: "Favourite artists", placeholder: "e.g. Radiohead", key: "likedArtists" },
  food: { label: "Favourite food", placeholder: "e.g. Korean, sushi, pizza", key: "likedFoods" },
};

/** Search-as-you-type against Qloo (through our API), picking up to three items. */
function Picker({ kind, picks, onChange }: { kind: Kind; picks: Named[]; onChange: (next: Named[]) => void }) {
  const { label, placeholder } = FIELD[kind];
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "searching" | "empty" | "error" | "limited">("idle");
  const listId = useId();
  const seq = useRef(0);
  const full = picks.length >= MAX_PICKS;

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 || full) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const mine = ++seq.current;
    setStatus("searching");
    const t = setTimeout(async () => {
      try {
        const found = (await searchTaste(kind, term)).filter((r) => !picks.some((p) => p.id === r.id));
        if (mine !== seq.current) return; // a newer search is on its way
        setResults(found);
        setStatus(found.length ? "idle" : "empty");
      } catch (err) {
        if (mine !== seq.current) return;
        setResults([]);
        setStatus(err instanceof ApiError && err.kind === "rate_limited" ? "limited" : "error");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, kind, full, picks]);

  function add(r: SearchResult) {
    onChange([...picks, { id: r.id, name: r.name }]);
    setQ("");
    setResults([]);
  }

  return (
    <div className="picker">
      <label className="picker-label" htmlFor={`${listId}-input`}>
        {label} <span className="picker-count">{picks.length}/{MAX_PICKS}</span>
      </label>
      {picks.length ? (
        <ul className="chips picks">
          {picks.map((p) => (
            <li key={p.id} className="chip chip-like">
              {p.name}
              <button type="button" className="chip-remove" aria-label={`Remove ${p.name}`} onClick={() => onChange(picks.filter((x) => x.id !== p.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!full ? (
        <div className="picker-field">
          <input
            id={`${listId}-input`}
            type="text"
            value={q}
            placeholder={placeholder}
            autoComplete="off"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                e.preventDefault();
                add(results[0]);
              }
            }}
          />
          {results.length ? (
            <ul className="picker-results" id={listId} role="listbox">
              {results.map((r) => (
                <li key={r.id} role="option" aria-selected={false}>
                  <button type="button" onClick={() => add(r)}>
                    {r.image ? <img src={r.image} alt="" referrerPolicy="no-referrer" /> : null}
                    <span>{r.name}</span>
                    {r.detail ? <span className="picker-detail">{r.detail}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="picker-status" aria-live="polite">
            {status === "searching"
              ? "Searching Qloo…"
              : status === "empty"
                ? "No match in Qloo — try another spelling."
                : status === "limited"
                  ? "Searching too fast — pause a moment."
                  : status === "error"
                    ? "Couldn't reach the taste service — try again."
                    : " "}
          </p>
        </div>
      ) : null}
    </div>
  );
}

interface Props {
  title: string;
  initial: TasteProfile;
  onSave: (p: TasteProfile) => void;
  onCancel: () => void;
}

/** Shrink a photo to ≤ 1280 px JPEG in the browser before upload (keeps it small; nothing else leaves the device). */
async function toJpegDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("unreadable image"));
      i.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "Snap your taste": a photo is read by Nemotron 3.5 Super VL and matched to Qloo; matches join the picks. */
function SnapTaste({ onFound }: { onFound: (r: SnapResult) => void }) {
  const [status, setStatus] = useState<{ kind: "idle" | "reading" | "done" | "error"; text?: string }>({ kind: "idle" });
  const inputId = useId();
  async function onFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setStatus({ kind: "error", text: "That isn't an image — try a JPEG or PNG photo." });
    setStatus({ kind: "reading", text: "Reading your photo with Nemotron 3.5 Super VL, then matching it in Qloo…" });
    try {
      const r = await snapTaste(await toJpegDataUrl(file));
      const found = r.movies.length + r.artists.length + r.foods.length;
      onFound(r);
      setStatus({
        kind: "done",
        text: found
          ? `${r.model} found ${[...r.movies, ...r.artists, ...r.foods].map((m) => m.name).join(", ")} (${(r.ms / 1000).toFixed(1)}s).${r.unmatched.length ? ` No Qloo match for: ${r.unmatched.join(", ")}.` : ""}`
          : "Nothing recognisable in that photo — try one with titles, covers, or a screenshot.",
      });
    } catch (err) {
      setStatus({
        kind: "error",
        text: err instanceof ApiError && err.kind === "rate_limited" ? "Too many photos in a minute — wait a moment." : "Couldn't read that photo right now — try again.",
      });
    }
  }
  return (
    <div className="snap">
      <label htmlFor={inputId} className={`secondary snap-button${status.kind === "reading" ? " is-busy" : ""}`}>
        📷 Snap your taste
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={status.kind === "reading"}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p className="section-note snap-status" aria-live="polite">
        {status.text ?? "A shelf, record sleeves, a Netflix or Spotify screenshot, or a meal you loved — the photo isn't stored."}
      </p>
    </div>
  );
}

export function ProfileBuilder({ title, initial, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<TasteProfile>(initial);
  /** Add photo matches to the picks, keeping each list to three and skipping duplicates. */
  const addFound = (r: SnapResult) =>
    setDraft((d) => {
      const merge = (have: Named[], found: Named[]) =>
        [...have, ...found.filter((f) => !have.some((h) => h.id === f.id)).map((f) => ({ id: f.id, name: f.name }))].slice(0, MAX_PICKS);
      return { ...d, likedMovies: merge(d.likedMovies, r.movies), likedArtists: merge(d.likedArtists, r.artists), likedFoods: merge(d.likedFoods, r.foods) };
    });
  const total = draft.likedMovies.length + draft.likedArtists.length + draft.likedFoods.length;
  // Live "in a few words" for the draft — instant feedback after picking or snapping a photo.
  const [words, setWords] = useState<string[] | null>(null);
  const draftKey = [...draft.likedMovies, ...draft.likedArtists, ...draft.likedFoods].map((x) => x.id).join(",");
  useEffect(() => {
    if (!total) return setWords(null);
    let live = true;
    const t = setTimeout(() => {
      requestTaste([draft])
        .then((r) => live && setWords(r.words[0] ?? []))
        .catch(() => live && setWords(null));
    }, 700);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  const set = (key: "likedMovies" | "likedArtists" | "likedFoods") => (next: Named[]) => setDraft((d) => ({ ...d, [key]: next }));

  return (
    <section className="builder" aria-label={title}>
      <h2>{title}</h2>
      <p className="section-note">Pick a few favourites. Each one is a real entity in Qloo's taste graph, so the plan comes from your taste.</p>
      <SnapTaste onFound={addFound} />
      <div className="pickers">
        {(Object.keys(FIELD) as Kind[]).map((k) => (
          <Picker key={k} kind={k} picks={draft[FIELD[k].key]} onChange={set(FIELD[k].key)} />
        ))}
      </div>
      {words?.length ? (
        <p className="taste-words builder-words" aria-live="polite">
          <span>Qloo reads this taste as</span> {words.join(" · ")}
        </p>
      ) : null}
      <div className="builder-actions">
        <button
          type="button"
          className="plan-button"
          disabled={!total}
          onClick={() => onSave(draft)}
        >
          Save taste
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        {!total ? <span className="section-note">Add at least one favourite.</span> : null}
      </div>
    </section>
  );
}
