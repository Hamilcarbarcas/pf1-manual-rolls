/**
 * Roll context: kind, group title, row label, per-roll manual choice. DESIGN.md §7.3.
 *
 * Two sources. Rolls stamped directly (pf1PreD20Roll, initiative) live in a WeakMap. Rolls made
 * inside an action use read the ambient stack pushed by the ActionUse/ChatAttack wrappers; the
 * stack is read once, when the resolver is constructed, which is synchronous with `evaluate`.
 */

import { MODULE_ID } from "./const.mjs";

/** @type {WeakMap<Roll, object>} */
const byRoll = new WeakMap();

/** @type {object[]} */
const ambient = [];

/** Per-roll choice from the d20 dialog. */
const choiceByRoll = new WeakMap();

/** Per-action choice from the attack dialog, keyed by `actionUse.shared`. */
const choiceByShared = new WeakMap();

const SUBJECT_KINDS = {
  skill: "skill",
  save: "save",
  ability: "ability",
};
const CORE_KINDS = {
  init: "initiative",
  cl: "caster",
  concentration: "caster",
  bab: "attack",
};

export function stampRoll(roll, ctx) {
  byRoll.set(roll, { ...byRoll.get(roll), ...ctx });
}

export const setRollChoice = (roll, value) => choiceByRoll.set(roll, value);
export const getRollChoice = (roll) => choiceByRoll.get(roll);
export const setSharedChoice = (shared, value) => choiceByShared.set(shared, value);
export const getSharedChoice = (shared) => choiceByShared.get(shared);
export const currentContext = () => ambient.at(-1) ?? null;

/** Runs `fn` with `ctx` on the ambient stack. Removal is by identity, so interleaved calls are safe. */
export async function withContext(ctx, fn) {
  ambient.push(ctx);
  try {
    return await fn();
  } finally {
    const i = ambient.lastIndexOf(ctx);
    if (i >= 0) ambient.splice(i, 1);
  }
}

/**
 * Context for a Roll about to be evaluated. Fields left undefined fall back at use:
 * kind "other", title from flavor or formula, choice from the global toggle.
 */
export function contextFor(roll) {
  const ctx = { ...ambient.at(-1), ...defined(byRoll.get(roll)) };
  const choice = choiceByRoll.get(roll);
  if (choice !== undefined) ctx.choice = choice;

  if (roll instanceof pf1.dice.DamageRoll) {
    ctx.kind = ctx.kind === "healing" ? "healing" : "damage";
    ctx.damageTypes = roll.options.damageType ?? [];
    ctx.critical = roll.isCritical;
    ctx.label = undefined;
  }
  ctx.kind ??= "other";
  ctx.title ??= roll.options?.flavor || roll.formula;
  return ctx;
}

/** Row label for one term of a Roll. §5 */
export function termLabel(term, ctx) {
  if (ctx.kind === "damage" || ctx.kind === "healing") {
    const what = term.flavor || damageTypeNames(ctx.damageTypes) || game.i18n.localize(
      ctx.kind === "healing" ? "PF1.Healing" : "PF1.Damage"
    );
    return ctx.critical ? game.i18n.format("MANUALROLLS.Label.Critical", { what }) : what;
  }
  return term.flavor || ctx.label || term.expression;
}

function damageTypeNames(ids = []) {
  return ids
    .filter((id) => id !== "untyped")
    .map((id) => pf1.registry.damageTypes.get(id)?.name ?? id)
    .join(", ");
}

function defined(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export function actorTitle(actionUse) {
  const who = actionUse.token?.name ?? actionUse.actor?.name;
  const what = actionUse.item?.name;
  return [who, what].filter(Boolean).join(": ") || undefined;
}

export function registerContext() {
  // d20Roll: skills, saves, ability checks, CL, concentration, BAB. Fires right before evaluate.
  Hooks.on("pf1PreD20Roll", (roll, options) => {
    const [[key, value] = []] = Object.entries(options.subject ?? {});
    const kind = key === "core" ? CORE_KINDS[value] : SUBJECT_KINDS[key];
    stampRoll(roll, {
      kind,
      title: options.speaker?.alias || undefined,
      label: roll.options?.flavor || options.flavor || undefined,
      match: { token: options.speaker?.token ?? undefined, actor: options.speaker?.actor ?? undefined },
    });
  });

  // One rollDamage call = one pass; its parts are evaluated in order, one DamageRoll each (§6.2).
  Hooks.on("pf1PreDamageRoll", (_action, _rollData, parts) => {
    const ctx = ambient.at(-1);
    if (!ctx?.slotBase || !Number.isInteger(ctx.passes)) return;
    ctx.pass = { index: ctx.passes++, parts, next: 0, rolls: [] };
  });

  libWrapper.register(
    MODULE_ID,
    "pf1.actionUse.ChatAttack.prototype.addAttack",
    function (wrapped, options = {}) {
      const critical = options?.critical === true;
      const attackIndex = this.rollData?.attackCount ?? 0;
      const ctx = {
        ...ambient.at(-1),
        kind: critical ? "confirmation" : "attack",
        label: critical ? game.i18n.localize("PF1.CriticalConfirmation") : this.label || game.i18n.localize("PF1.Attack"),
        attackIndex,
        slotBase: `a${attackIndex}:${critical ? "confirm" : "attack"}`,
        passes: undefined,
        pass: null,
      };
      return withContext(ctx, () => wrapped(options));
    },
    "WRAPPER"
  );

  libWrapper.register(
    MODULE_ID,
    "pf1.actionUse.ChatAttack.prototype.addDamage",
    function (wrapped, options = {}) {
      const attackIndex = this.rollData?.attackCount ?? 0;
      const ctx = {
        ...ambient.at(-1),
        kind: this.isHealing ? "healing" : "damage",
        attackIndex,
        slotBase: `a${attackIndex}:${options?.critical === true ? "critDamage" : "damage"}`,
        passes: 0,
        pass: null,
      };
      return withContext(ctx, () => wrapped(options));
    },
    "WRAPPER"
  );
}
