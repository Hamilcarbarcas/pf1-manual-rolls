/**
 * The resolver and its two wrappers. DESIGN.md §7.1, §7.2.
 *
 * One ManualRollResolver per evaluated Roll. It renders nothing itself: manual dice become rows in
 * the shared prompt window, and the faces are pushed into `term.results` before the formula is
 * evaluated, so core only rolls what is still missing.
 */

import { MODULE_ID } from "./const.mjs";
import { collectDice, dieIcon, isManual } from "./decide.mjs";
import { promptWindow } from "./prompt-window.mjs";

const RollResolver = foundry.applications.dice.RollResolver;
const Roll = foundry.dice.Roll;

export class ManualRollResolver extends RollResolver {
  /** Groups this Roll's rows in the window. */
  #key = foundry.utils.randomID();

  /** @override */
  async awaitFulfillment() {
    await this.#fulfill(collectDice(this.roll.terms));
  }

  /**
   * A term whose count or size was itself a roll, reached once that inner roll is evaluated.
   * @override
   */
  async addTerm(term) {
    if (!(term instanceof foundry.dice.terms.DiceTerm)) {
      throw new Error("Only DiceTerm instances may be added to the RollResolver.");
    }
    await this.#fulfill([term]);
  }

  /**
   * One extra die from a modifier (explode, reroll).
   * @override
   */
  async resolveResult(term, _method, { reroll = false, explode = false } = {}) {
    const [faces] = await this.#prompt([term], () => 1, reroll ? "reroll" : explode ? "explode" : null);
    return faces[0];
  }

  /** @override */
  registerResult(_method, denomination, result) {
    const faces = Number(String(denomination).replace(/^d/, ""));
    const consumed = promptWindow().registerResult(faces, result);
    if (!consumed) ui.notifications.warn(`${denomination} roll was not needed by the resolver.`);
    return consumed;
  }

  /**
   * Nothing is rendered, so there is nothing to tear down.
   * @override
   */
  async close(_options) {
    Roll.defaultImplementation.RESOLVERS.delete(this.roll);
    return this;
  }

  /** Prompt for every manual die among `terms` still missing faces, then fill them. */
  async #fulfill(terms) {
    const manual = [];
    for (const term of terms) {
      if (term._id) continue;
      term._id = foundry.utils.randomID();
      if (!isManual(term, this.roll)) continue;
      term.method = "manual";
      if (Math.abs(term.number) > term.results.length) manual.push(term);
    }
    if (!manual.length) return;

    Roll.defaultImplementation.RESOLVERS.set(this.roll, this);
    const faces = await this.#prompt(manual, (term) => Math.abs(term.number) - term.results.length);
    manual.forEach((term, i) => {
      for (const result of faces[i]) term.results.push({ result, active: true });
    });
  }

  /** @returns {Promise<number[][]>} Faces per term, in order. */
  #prompt(terms, count, extra = null) {
    const rows = terms.map((term) => ({
      label: rowLabel(term),
      kind: "other",
      faces: term.faces,
      denomination: `d${term.faces}`,
      icon: dieIcon(term),
      count: count(term),
      randomFace: () => term.randomFace(),
      extra,
    }));
    return Promise.all(promptWindow().request(this.#key, groupTitle(this.roll), rows));
  }
}

function groupTitle(roll) {
  return roll.options?.flavor || roll.formula;
}

function rowLabel(term) {
  return term.flavor ? `${term.expression} ${term.flavor}` : term.expression;
}

/** True when core's per-die config names another interactive method (a connected-dice module). */
function otherInteractiveConfigured() {
  const config = game.settings.get("core", Roll.DICE_CONFIGURATION_SETTING) ?? {};
  return Object.values(config).some(
    (method) => method && method !== "manual" && CONFIG.Dice.fulfillment.methods[method]?.interactive
  );
}

export function registerResolver() {
  libWrapper.register(
    MODULE_ID,
    "foundry.dice.Roll.resolverImplementation",
    function (wrapped) {
      if (otherInteractiveConfigured()) return wrapped();
      return ManualRollResolver;
    },
    "MIXED"
  );

  // Extra dice. Answers before core's per-die config is consulted (§7.2).
  libWrapper.register(
    MODULE_ID,
    "foundry.dice.terms.DiceTerm.prototype._roll",
    function (wrapped, options = {}) {
      const resolver = this.resolver;
      if (!(resolver instanceof ManualRollResolver)) return wrapped(options);
      if (this.method === "manual" && isManual(this, resolver.roll)) {
        return resolver.resolveResult(this, "manual", options);
      }
      const fallback = CONFIG.Dice.fulfillment.methods[CONFIG.Dice.fulfillment.defaultMethod];
      if (fallback && !fallback.interactive) return fallback.handler?.(this, options);
      return undefined;
    },
    "MIXED"
  );
}
