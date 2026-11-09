/**
 * Field diagnostics: which seams ran, what failed, and what the resolver saw per roll.
 * `game.pf1ManualRolls.diagnose()` returns it all as plain JSON. DESIGN.md §11.6.
 */

import { MODULE_ID } from "./const.mjs";

const TRACE_SIZE = 60;

const steps = {};
const counts = {};
const errors = [];
const trace = [];

/** Runs one startup step; a failure is logged and recorded, never thrown. */
export function step(name, fn) {
  try {
    fn();
    steps[name] = "ok";
  } catch (err) {
    steps[name] = String(err?.message ?? err);
    console.error(`${MODULE_ID} | startup step "${name}" failed:`, err);
  }
}

export function failedSteps() {
  return Object.entries(steps).filter(([, v]) => v !== "ok").map(([k]) => k);
}

export function count(name) {
  counts[name] = (counts[name] ?? 0) + 1;
}

export function noteError(where, err) {
  errors.push({ where, message: String(err?.message ?? err), at: new Date().toISOString() });
  if (errors.length > 20) errors.shift();
}

/** One entry per resolver: the roll, its context, and where each die's faces came from. */
export function traceRoll(entry) {
  trace.push({ at: new Date().toISOString(), ...entry });
  if (trace.length > TRACE_SIZE) trace.shift();
  return trace.at(-1);
}

export function diagnose() {
  let resolver;
  try {
    resolver = foundry.dice.Roll.resolverImplementation?.name;
  } catch (err) {
    resolver = `error: ${err.message}`;
  }
  const safe = (fn) => {
    try {
      return fn();
    } catch (err) {
      return `error: ${err.message}`;
    }
  };
  return {
    module: game.modules.get(MODULE_ID)?.version,
    pf1: game.system?.version,
    steps,
    resolverInUse: resolver,
    permitted: safe(() => game.user.hasPermission("MANUAL_ROLLS")),
    enabled: safe(() => game.settings.get(MODULE_ID, "enabled")),
    dice: safe(() => game.settings.get(MODULE_ID, "dice")),
    coreDiceConfiguration: safe(() => game.settings.get("core", "diceConfiguration")),
    criticalEffects: {
      active: !!game.modules.get("pf1-critical-effects")?.active,
      confirmationsDeferred: safe(() => game.criticalEffects?.confirmations?.enabled?.()),
      pf1CritConfirm: safe(() => game.settings.get("pf1", "critConfirm")),
    },
    counts,
    errors,
    trace,
  };
}
