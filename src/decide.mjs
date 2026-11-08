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

/** Phase 1: permission, global toggle, die filter. */
export function isManual(term, _roll) {
  return isPermitted() && isEnabled() && isDieAllowed(dieKey(term));
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
