/**
 * The resolver and its two wrappers. DESIGN.md §7.1, §7.2.
 *
 * One ManualRollResolver per evaluated Roll. It renders nothing itself: manual dice become rows in
 * the shared prompt window, and the faces are pushed into `term.results` before the formula is
 * evaluated, so core only rolls what is still missing.
 */

import { MODULE_ID } from "./const.mjs";
import { collectDice, dieIcon, isManual, isThrowaway, keepOf } from "./decide.mjs";
import { promptWindow } from "./prompt-window.mjs";
import { contextFor, currentContext, termLabel } from "./context.mjs";
import { keysFor, slotKeys } from "./slots.mjs";
import { traceRoll } from "./diagnostics.mjs";

const RollResolver = foundry.applications.dice.RollResolver;
const Roll = foundry.dice.Roll;

export class ManualRollResolver extends RollResolver {
  constructor(roll, options) {
    super(roll, options);
    // Read now: construction is synchronous with `evaluate`, so the ambient context is this roll's.
    this.context = contextFor(roll);
    this.#key = this.context.groupKey ?? foundry.utils.randomID();
    this.preview = this.context.preview === true;
    this.throwaway = isThrowaway(roll, this.context);
    const dice = collectDice(roll.terms);
    const keys = slotKeys(roll, this.context);
    this.#termKeys = new Map(keys ? dice.map((term, i) => [term, keys[i]]) : []);
    this.#trace = traceRoll({
      roll: roll.constructor.name,
      formula: roll.formula,
      kind: this.context.kind,
      label: this.context.label,
      slotBase: this.context.slotBase ?? null,
      groupKey: this.context.groupKey ?? null,
      batch: !!this.context.batch,
      expectation: !!this.context.expectation,
      choice: this.context.choice ?? null,
      preview: this.preview,
      throwaway: this.throwaway,
      keys: keys ?? null,
      dice: {},
    });
  }

  #trace;

  /** Groups rows in the window: one action or batch shares a key (§5 late rows). */
  #key;

  /** @type {Map<DiceTerm, string>} Slot key per term known at construction (§6.5). */
  #termKeys;

  /** Where slot faces live: the action's batch, or an expected-dice batch's (§6.3). */
  #batch = null;

  /** @override */
  async awaitFulfillment() {
    const terms = collectDice(this.roll.terms);
    if (this.preview) {
      this.#fillPreview(terms);
      if (!this.throwaway) {
        this.context.batch?.record(
          this.roll, this.context, this.#termKeys,
          (term) => isManual(term, this.context), (term) => termLabel(term, this.context)
        );
      }
      return;
    }
    await this.#claimExpected(terms);
    await this.#fulfill(terms);
  }

  /** Inside an expected-dice batch: wait for its prompt, then take one expected roll's keys. */
  async #claimExpected(terms) {
    const expectation = this.context.expectation;
    if (!expectation) return;
    await expectation.ready();
    const base = expectation.claim(this.roll, this.context);
    if (base) {
      const keys = keysFor(base, terms);
      this.#termKeys = new Map(terms.map((term, i) => [term, keys[i]]));
    }
    this.#batch = expectation.batch;
  }

  /**
   * A term whose count or size was itself a roll, reached once that inner roll is evaluated.
   * @override
   */
  async addTerm(term) {
    if (!(term instanceof foundry.dice.terms.DiceTerm)) {
      throw new Error("Only DiceTerm instances may be added to the RollResolver.");
    }
    if (this.preview) this.#fillPreview([term]);
    else await this.#fulfill([term]);
  }

  /**
   * One extra die from a modifier (explode, reroll).
   * @override
   */
  async resolveResult(term, _method, { reroll = false, explode = false } = {}) {
    const [faces] = await this.#prompt([term], () => 1, reroll ? "reroll" : explode ? "explode" : null);
    if (faces.typed?.[0] === false) term.method = undefined;
    return faces[0];
  }

  /** Whether this resolver decided the term is rolled by hand (its extra dice prompt too). */
  isManualTerm(term) {
    return this.#manualTerms.has(term);
  }

  #manualTerms = new WeakSet();

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

  /**
   * Preview faces: the attack's dice roll their maximum so the preview always threatens and
   * reaches the confirmation and crit damage (§6.2); everything else rolls 1, which never explodes.
   */
  #fillPreview(terms) {
    const face = (term) => (this.context.kind === "attack" ? term.faces : 1);
    for (const term of terms) {
      term._id ??= foundry.utils.randomID();
      while (term.results.length < Math.abs(term.number)) term.results.push({ result: face(term), active: true });
    }
  }

  /**
   * Fill every manual die among `terms`: from its slot's faces where they fit, else by prompting.
   * `method = "manual"` (the card's keyboard icon) only when every one of the term's dice was
   * typed; a box left empty rolled digitally.
   */
  async #fulfill(terms) {
    const batch = this.#batch ?? this.context.batch;
    const manual = [];
    const typed = new Map();
    for (const term of terms) {
      const name = term.expression;
      if (term._id) {
        this.#trace.dice[name] = "already handled";
        continue;
      }
      term._id = foundry.utils.randomID();
      if (this.throwaway || !isManual(term, this.context)) {
        this.#trace.dice[name] = this.throwaway ? "digital (thrown away)" : "digital";
        continue;
      }
      this.#manualTerms.add(term);
      const flags = term.results.map(() => false);
      typed.set(term, flags);
      const stored = batch?.faces.get(this.#termKeys.get(term));
      if (stored) {
        const number = Math.abs(term.number);
        for (let j = term.results.length; j < Math.min(number, stored.length); j++) {
          term.results.push({ result: stored[j], active: true });
          flags.push(stored.typed?.[j] ?? true);
        }
      }
      const missing = Math.abs(term.number) > term.results.length;
      this.#trace.dice[name] = stored ? (missing ? "slot, rest prompted" : "slot") : "prompted";
      if (missing) manual.push(term);
    }

    if (manual.length) {
      Roll.defaultImplementation.RESOLVERS.set(this.roll, this);
      const faces = await this.#prompt(manual, (term) => Math.abs(term.number) - term.results.length);
      manual.forEach((term, i) => {
        const flags = typed.get(term);
        faces[i].forEach((result, j) => {
          term.results.push({ result, active: true });
          flags.push(faces[i].typed?.[j] ?? true);
        });
        const key = this.#termKeys.get(term);
        if (batch && key) {
          const stored = term.results.map((r) => r.result);
          stored.typed = flags;
          batch.faces.set(key, stored);
        }
      });
    }

    for (const [term, flags] of typed) {
      if (flags.length && flags.every(Boolean)) term.method = "manual";
    }
  }

  /** @returns {Promise<number[][]>} Faces per term, in order. */
  #prompt(terms, count, extra = null) {
    const rows = terms.map((term) => ({
      label: termLabel(term, this.context),
      kind: this.context.kind,
      faces: term.faces,
      denomination: `d${term.faces}`,
      icon: dieIcon(term),
      count: count(term),
      keep: keepOf(term),
      randomFace: () => term.randomFace(),
      extra,
    }));
    return Promise.all(promptWindow().request(this.#key, this.context.title, rows));
  }
}

/**
 * T2: a confirmation replaced with `allowInteractive: false` (roll-bonuses Snake Sidewind) reuses
 * the confirmation faces already entered for this attack. §6.5
 */
function reusedFace(term) {
  const ctx = currentContext();
  const roll = term._root;
  if (!ctx?.batch || ctx.preview || !(roll instanceof pf1.dice.D20RollPF)) return undefined;
  if (!/:(attack|confirm)$/.test(ctx.slotBase ?? "")) return undefined;
  const keys = slotKeys(roll, ctx);
  const key = keys?.[collectDice(roll.terms).indexOf(term)];
  const stored = key ? ctx.batch.faces.get(key) : undefined;
  const face = stored?.[term.results.length];
  if (face !== undefined && (stored.typed?.[term.results.length] ?? true)) term.method = "manual";
  return face;
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
      if (!resolver) return reusedFace(this) ?? wrapped(options);
      if (!(resolver instanceof ManualRollResolver)) return wrapped(options);
      if (resolver.preview) return 1;
      if (!resolver.throwaway && resolver.isManualTerm(this) && isManual(this, resolver.context)) {
        return resolver.resolveResult(this, "manual", options);
      }
      const fallback = CONFIG.Dice.fulfillment.methods[CONFIG.Dice.fulfillment.defaultMethod];
      if (fallback && !fallback.interactive) return fallback.handler?.(this, options);
      return undefined;
    },
    "MIXED"
  );
}
