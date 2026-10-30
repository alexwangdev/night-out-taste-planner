/** Quick mechanical check of the CAD budget rules (prd.md > Plan and explain one evening). Run: npm run check */
import assert from "node:assert/strict";
import { filterDinner, parseBudget, PRICE_LEVEL_CAD } from "../services/budget.js";
import type { Candidate } from "../types.js";

const place = (id: string, priceLevel?: number): Candidate => ({ id, name: id, priceLevel, tags: [], tagIds: [], links: [] });

assert.deepEqual(parseBudget("Plan my Friday night, something cozy, under $60 CAD"), { budgetCad: 60, assumed: false });
assert.deepEqual(parseBudget("cozy, $45 max, maybe $80"), { budgetCad: 45, assumed: false });
assert.deepEqual(parseBudget("something cozy"), { budgetCad: 60, assumed: true });
assert.deepEqual(PRICE_LEVEL_CAD, { 1: 15, 2: 30, 3: 50, 4: 90 });

const pool = [place("cheap", 1), place("mid", 2), place("nice", 3), place("fancy", 4), place("unpriced")];
assert.deepEqual(filterDinner(pool, 60)!.candidates.map((c) => c.id), ["cheap", "mid", "nice"]);
assert.equal(filterDinner(pool, 60)!.overBudget, false);
assert.deepEqual(filterDinner(pool, 10), { candidates: [place("cheap", 1)], overBudget: true });
assert.equal(filterDinner([place("unpriced")], 60), null);
assert.ok(!filterDinner(pool, 60)!.candidates.some((c) => c.id === "unpriced"));

console.log("budget checks OK");
