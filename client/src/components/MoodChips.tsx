import type { MoodRead } from "../types";

/** What the mood agent read from the prompt, and the Qloo tags it used to steer each category. */
export function MoodChips({ mood }: { mood?: MoodRead }) {
  if (!mood?.tags.length) return null;
  const names = [...new Set(mood.tags.map((t) => t.name))];
  return (
    <section className="mood" aria-label="How I read your night">
      <p className="mood-label">
        How I read your night{mood.reading ? <span className="mood-reading">: {mood.reading}</span> : null}
      </p>
      <ul className="mood-tags">
        {names.map((n) => (
          <li key={n} title="Qloo taste-graph tag used to steer the picks">
            {n}
          </li>
        ))}
      </ul>
    </section>
  );
}
