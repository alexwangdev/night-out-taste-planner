import { EXAMPLE_PROMPT } from "./PromptForm";

const EXAMPLES = [EXAMPLE_PROMPT, "A rainy Sunday date night, nothing too fancy, $40 CAD", "Something cozy after a long week"];

export function ExamplePrompts({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <section className="examples" aria-label="Example prompts">
      <p className="examples-label">Try one of these</p>
      <ul>
        {EXAMPLES.map((ex) => (
          <li key={ex}>
            <button type="button" className="example" onClick={() => onPick(ex)}>
              {ex}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
