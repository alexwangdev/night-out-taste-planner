import type { FormEvent } from "react";

export const EXAMPLE_PROMPT = "Plan my Friday night, something cozy, under $60 CAD";

interface Props {
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

export function PromptForm({ value, busy, onChange, onSubmit }: Props) {
  const empty = !value.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!empty && !busy) onSubmit();
  };
  return (
    <form className="prompt" onSubmit={submit}>
      <label htmlFor="prompt" className="sr-only">
        Describe your evening
      </label>
      <textarea
        id="prompt"
        rows={2}
        maxLength={300}
        value={value}
        placeholder={EXAMPLE_PROMPT}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) submit(e);
        }}
      />
      <div className="prompt-row">
        <p className="hint" aria-live="polite">
          {busy ? "Finding your evening…" : empty ? "Tell me a mood or occasion — try ‘something cozy’." : " "}
        </p>
        <button type="submit" className="plan-button" disabled={empty || busy}>
          Plan my evening
        </button>
      </div>
    </form>
  );
}
