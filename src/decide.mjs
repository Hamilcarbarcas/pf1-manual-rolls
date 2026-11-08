/**
 * Which dice are manual. DESIGN.md §7.2. Core's per-die configuration is ignored (§4.2).
 */

import { DIE_KEYS, OTHER_DIE_ICON } from "./const.mjs";
import { isPermitted, isEnabled, isDieAllowed } from "./settings.mjs";

export function dieKey(term) {
  if (!(term instanceof foundry.dice.terms.Die)) return "other";
  const key = `d${term.faces}`;
  return DIE_KEYS.includes(key) ? key : "other";
}

export function dieIcon(term) {
  return CONFIG.Dice.fulfillment.dice[`d${term.faces}`]?.icon ?? OTHER_DIE_ICON;
}

/**
 * Permission, then the roll's own choice (dialog checkbox) or the global toggle, then the filter.
 * @param {DiceTerm} term
 * @param {{choice?: boolean}} [ctx]  From `contextFor`.
 */
export function isManual(term, ctx) {
  return isPermitted() && (ctx?.choice ?? isEnabled()) && isDieAllowed(dieKey(term));
}

/**
 * A roll whose result is discarded, so it never prompts. §6.5
 * T3: critical-effects defers the confirmation and drops PF1's inline one.
 */
export function isThrowaway(roll, ctx) {
  return ctx?.kind === "confirmation" && roll instanceof pf1.dice.D20RollPF && confirmationDeferred();
}

export function confirmationDeferred() {
  try {
    return game.criticalEffects?.confirmations?.enabled?.() === true;
  } catch {
    return false;
  }
}

/** Keep/drop modifier as {mode: "high"|"low", n}, or null. `2d20kh`, `3d20kl1`, `4d6dl`. */
export function keepOf(term) {
  for (const modifier of term.modifiers ?? []) {
    const match = /^(k[hl]?|d[hl]?)(\d*)$/i.exec(modifier);
    if (!match) continue;
    const [, op, count] = match;
    const n = count ? Number(count) : 1;
    const number = Math.abs(term.number ?? 0);
    switch (op.toLowerCase()) {
      case "k":
      case "kh": return { mode: "high", n };
      case "kl": return { mode: "low", n };
      case "d":
      case "dl": return { mode: "high", n: Math.max(0, number - n) };
      case "dh": return { mode: "low", n: Math.max(0, number - n) };
    }
  }
  return null;
}

/**
 * Every DiceTerm in `terms` whose count and size are known, including pool members.
 * Mirrors core's `Roll.identifyFulfillableTerms` walk.
 */
export function collectDice(terms, out = []) {
  for (const term of terms ?? []) {
    if (term instanceof foundry.dice.terms.DiceTerm && term.number && term.faces) out.push(term);
    if ("dice" in term) collectDice(term.dice, out);
  }
  return out;
}
