import type { Candidate } from "../types.js";

export const DEFAULT_BUDGET_CAD = 60;

/** Agreed mapping from Qloo restaurant price level to an estimated meal for one, CAD, before tip. */
export const PRICE_LEVEL_CAD: Record<number, number> = { 1: 15, 2: 30, 3: 50, 4: 90 };

export interface Budget {
  budgetCad: number;
  /** True when the prompt had no `$N`, so the $60 default was used. */
  assumed: boolean;
}

/** The first explicit `$N` in the prompt, read as CAD; otherwise the $60 default. */
export function parseBudget(prompt: string): Budget {
  const m = prompt.match(/\$\s*(\d{1,5}(?:\.\d{1,2})?)/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? { budgetCad: n, assumed: false } : { budgetCad: DEFAULT_BUDGET_CAD, assumed: true };
}

export function estimatedCostCad(c: Candidate): number | undefined {
  return c.priceLevel === undefined ? undefined : PRICE_LEVEL_CAD[c.priceLevel];
}

export interface DinnerPool {
  candidates: Candidate[];
  /** True when nothing fit and the pool is the single closest over-budget place. */
  overBudget: boolean;
}

/**
 * Applies the budget before the model sees anything.
 * Unpriced places are never eligible. Returns null when no priced place exists at all.
 */
export function filterDinner(candidates: Candidate[], budgetCad: number): DinnerPool | null {
  const priced = candidates.filter((c) => estimatedCostCad(c) !== undefined);
  if (!priced.length) return null;
  const fits = priced.filter((c) => estimatedCostCad(c)! <= budgetCad);
  if (fits.length) return { candidates: fits, overBudget: false };
  const closest = [...priced].sort((a, b) => estimatedCostCad(a)! - estimatedCostCad(b)!)[0];
  return { candidates: [closest], overBudget: true };
}
