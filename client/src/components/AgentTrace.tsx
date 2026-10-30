import type { TraceStep } from "../types";

const ICON: Record<TraceStep["status"], string> = { running: "◌", done: "✓", warn: "!" };

function Steps({ steps }: { steps: TraceStep[] }) {
  return (
    <ol className="trace-steps">
      {steps.map((s) => (
        <li key={s.id} className={`trace-step is-${s.status}`}>
          <span className="trace-icon" aria-hidden="true">
            {ICON[s.status]}
          </span>
          <div>
            <p className="trace-label">
              {s.label}
              {s.model ? <span className="trace-model">{s.model}</span> : null}
              {s.ms !== undefined ? <span className="trace-ms">{(s.ms / 1000).toFixed(1)}s</span> : null}
            </p>
            {s.detail ? <p className="trace-detail">{s.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The agent's steps: live while planning, then folded under the plan as "How this plan was made". */
export function AgentTrace({ steps, live }: { steps: TraceStep[]; live: boolean }) {
  if (!steps.length) return null;
  if (live) {
    return (
      <section className="trace trace-live" aria-live="polite" aria-label="What the agent is doing">
        <Steps steps={steps} />
      </section>
    );
  }
  return (
    <details className="trace">
      <summary>How this plan was made · Qloo + NVIDIA Nemotron on Nebius Token Factory</summary>
      <Steps steps={steps} />
    </details>
  );
}
