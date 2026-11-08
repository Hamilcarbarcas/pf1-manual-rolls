/**
 * Expected-dice batches: dice for a loop of rolls asked for up front, in one prompt.
 * DESIGN.md §6.3.
 *
 * Callers describe the rolls (`expect`); initiative builds its own description from the
 * combatants once its dialog has run. Each Roll made inside then claims one expected roll, by
 * who is rolling when it can tell, else by dice in order, and takes that roll's faces.
 */

import { MODULE_ID } from "./const.mjs";
import { collectDice, dieIcon, isManual, keepOf } from "./decide.mjs";
import { isEnabled, isPermitted } from "./settings.mjs";
import { stampRoll, withContext } from "./context.mjs";
import { promptWindow } from "./prompt-window.mjs";
import { Batch } from "./slots.mjs";

/**
 * @typedef ExpectedRoll
 * @property {string} key       Unique within the batch.
 * @property {string} label     Row label: who or what is rolling.
 * @property {string} [kind]    One of KINDS; "other" when omitted.
 * @property {string} formula   Dice formula; only its dice matter ("1d20", "1d20 + 1d4").
 * @property {object} [data]    Roll data for `@` references in the formula.
 * @property {{token?: string, actor?: string, combatant?: string}} [match]  Who rolls it.
 */

export class Expectation {
  /**
   * @param {object} options
   * @param {string} options.title
   * @param {boolean|(() => boolean|undefined)} [options.choice]  Per-call manual choice, or a
   *   getter for one decided later (initiative's dialog); the global toggle when undefined.
   * @param {() => ExpectedRoll[]} options.build  Called once, at the first prompt.
   */
  constructor({ title, choice, build }) {
    this.title = title;
    this.groupKey = foundry.utils.randomID();
    this.batch = new Batch();
    this.#choice = choice;
    this.#build = build;
  }

  get choice() {
    return typeof this.#choice === "function" ? this.#choice() : this.#choice;
  }

  #choice;
  #build;
  #ready = null;

  /** @type {Array<ExpectedRoll & {sig: string, claimed: boolean}>} */
  rolls = [];

  /** Prompts for every expected manual die, once. */
  ready() {
    this.#ready ??= this.#prompt().catch((err) => {
      console.error(`${MODULE_ID} | asking for the expected dice failed; prompting per roll:`, err);
    });
    return this.#ready;
  }

  /**
   * The expected roll a Roll stands for, claimed so no other Roll takes it: first by who rolls
   * (`ctx.match`), else the first unclaimed roll with the same dice.
   * @returns {string|null} Slot base for `{base}:d{faces}:{k}` keys.
   */
  claim(roll, ctx) {
    const open = this.rolls.filter((r) => !r.claimed);
    let found = ctx.match ? open.find((r) => r.match && sameRoller(r.match, ctx.match)) : null;
    found ??= open.find((r) => r.sig === signature(roll));
    if (!found) return null;
    found.claimed = true;
    return found.key;
  }

  async #prompt() {
    const ctx = { choice: this.choice };
    const rows = [];
    for (const spec of this.#build() ?? []) {
      let terms;
      try {
        terms = collectDice(new foundry.dice.Roll(spec.formula, spec.data ?? {}).terms);
      } catch (err) {
        console.error(`${MODULE_ID} | expected roll "${spec.label}" has an unparsable formula:`, spec.formula, err);
        continue;
      }
      this.rolls.push({ ...spec, sig: terms.map((t) => t.faces).join(","), claimed: false });
      const seen = {};
      for (const term of terms) {
        const k = (seen[term.faces] = (seen[term.faces] ?? -1) + 1);
        if (!isManual(term, ctx)) continue;
        rows.push({
          ref: `${spec.key}:d${term.faces}:${k}`,
          label: terms.length > 1 && (term.flavor || k > 0) ? `${spec.label}: ${term.flavor || term.expression}` : spec.label,
          kind: spec.kind ?? "other",
          faces: term.faces,
          denomination: `d${term.faces}`,
          icon: dieIcon(term),
          count: Math.abs(term.number),
          keep: keepOf(term),
          conditional: null,
          randomFace: () => term.randomFace(),
        });
      }
    }
    if (!rows.length) return;
    const faces = await Promise.all(promptWindow().request(this.groupKey, this.title, rows));
    rows.forEach((row, i) => {
      if (faces[i]) this.batch.faces.set(row.ref, faces[i]);
    });
  }
}

function sameRoller(a, b) {
  if (a.combatant || b.combatant) return a.combatant === b.combatant;
  if (a.token && b.token) return a.token === b.token;
  return !!a.actor && a.actor === b.actor;
}

function signature(roll) {
  return collectDice(roll.terms).map((t) => t.faces).join(",");
}

/**
 * Public API: ask for the dice of every roll `fn` is about to make, in one prompt, then run it.
 * Does nothing extra when manual rolls are off for this user.
 * @param {ExpectedRoll[]} rolls
 * @param {() => Promise<any>} fn
 * @param {{title?: string, choice?: boolean}} [options]
 */
export async function expect(rolls, fn, { title, choice } = {}) {
  if (!isPermitted() || !(choice ?? isEnabled()) || !rolls?.length) return fn();
  const expectation = new Expectation({
    title: title || game.i18n.localize("MANUALROLLS.Window.Title"),
    choice,
    build: () => rolls,
  });
  await expectation.ready();
  return withContext({ expectation, groupKey: expectation.groupKey, title: expectation.title, choice }, fn);
}

/** Open `rollInitiative` calls, innermost last. */
const initiativeCalls = [];

export const currentInitiativeCall = () => initiativeCalls.at(-1) ?? null;

/**
 * Initiative: the expected rolls of one `rollInitiative` call, built from its ids and the
 * formula arguments the first `getInitiativeRoll` saw (the dialog has run by then).
 */
export function initiativeExpectation(combat, call) {
  return new Expectation({
    title: game.i18n.localize("PF1.Initiative"),
    choice: () => call.choice,
    build: () => {
      const { formula = null, d20 = null, bonus = null } = call.args ?? {};
      return call.ids
        .map((id) => combat.combatants.get(id))
        .filter((c) => c?.isOwner)
        .map((c) => {
          const data = c.actor?.getRollData() ?? {};
          let f = formula || c._getInitiativeFormula(d20);
          if (bonus) {
            data.bonus = bonus;
            f += " + @bonus";
          }
          return { key: `init:${c.id}`, label: c.name, kind: "initiative", formula: f, data, match: { combatant: c.id } };
        });
    },
  });
}

export function registerInitiative() {
  libWrapper.register(
    MODULE_ID,
    "pf1.documents.CombatPF.prototype.rollInitiative",
    async function (wrapped, ...args) {
      const ids = Array.isArray(args[0]) ? args[0] : [args[0]];
      const call = { ids, args: null, choice: undefined };
      call.expectation = initiativeExpectation(this, call);
      initiativeCalls.push(call);
      try {
        return await wrapped(...args);
      } finally {
        initiativeCalls.splice(initiativeCalls.indexOf(call), 1);
      }
    },
    "WRAPPER"
  );

  libWrapper.register(
    MODULE_ID,
    "pf1.documents.CombatantPF.prototype.getInitiativeRoll",
    function (wrapped, ...args) {
      const roll = wrapped(...args);
      const call = currentInitiativeCall();
      if (call) call.args ??= { formula: args[0] ?? null, d20: args[1] ?? null, bonus: args[2] ?? null };
      stampRoll(roll, {
        kind: "initiative",
        title: call ? call.expectation.title : this.name,
        label: this.name,
        choice: call?.choice,
        groupKey: call?.expectation.groupKey,
        expectation: call?.expectation,
        match: { combatant: this.id },
      });
      return roll;
    },
    "WRAPPER"
  );
}
