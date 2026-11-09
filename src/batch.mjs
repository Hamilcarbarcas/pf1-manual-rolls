/**
 * Item-use batches: every die an action needs, asked for in one prompt before PF1 rolls.
 * DESIGN.md §6.2, §11.5.
 *
 * A preview pass runs the attack generation on a copy of the action's shared data, with the
 * resolver in preview mode recording each manual term as a slot. The prompt fills the slots, then
 * the real pass runs and each Roll takes its faces by slot key.
 *
 * One session can cover several actions (pf1-sequential-attacks' Roll All on a two-weapon
 * routine): each previews and runs under its own prefix, so their slot keys never collide.
 */

import { MODULE_ID, PREVIEW_FLAG } from "./const.mjs";
import { isEnabled, isPermitted } from "./settings.mjs";
import { actorTitle, getSharedChoice, withContext } from "./context.mjs";
import { promptWindow } from "./prompt-window.mjs";
import { Batch } from "./slots.mjs";
import { count, noteError } from "./diagnostics.mjs";

export class AttackSession {
  /** @param {{title?: string}} [options] */
  constructor({ title } = {}) {
    this.title = title;
    this.groupKey = foundry.utils.randomID();
    this.batch = new Batch();
  }

  #prompted = false;

  /** Whether an action's rolls are manual: its attack dialog's checkbox, else the toggle. */
  static isManual(actionUse) {
    return isPermitted() && (getSharedChoice(actionUse.shared) ?? isEnabled());
  }

  #context(prefix, actionUse) {
    return {
      title: this.title ?? actorTitle(actionUse),
      choice: getSharedChoice(actionUse.shared),
      groupKey: this.groupKey,
      batch: this.batch,
      slotPrefix: prefix,
    };
  }

  /**
   * Record the dice `build` rolls for one action, run against a copy of it.
   * A failed preview only costs that action its rows: its rolls prompt as follow-ups.
   * @param {string} prefix  Unique per action within the session ("" for a lone action).
   * @param {ActionUse} actionUse
   * @param {(use: ActionUse) => Promise<void>} build  Attack generation, given the copy.
   */
  async preview(prefix, actionUse, build) {
    if (!AttackSession.isManual(actionUse)) {
      count("preview skipped (not manual)");
      return;
    }
    count("preview");
    this.title ??= actorTitle(actionUse);
    try {
      await withContext({ ...this.#context(prefix, actionUse), preview: true }, () => build(copyActionUse(actionUse)));
    } catch (err) {
      noteError("preview", err);
      console.error(`${MODULE_ID} | previewing the action's dice failed; prompting per roll:`, err);
      for (const key of [...this.batch.slots.keys()]) if (key.startsWith(prefix)) this.batch.slots.delete(key);
    }
  }

  /** One prompt for every previewed slot. */
  async prompt() {
    if (this.#prompted) return;
    this.#prompted = true;
    const rows = buildRows(this.batch);
    count(rows.length ? "batch prompt" : "batch prompt (no rows)");
    if (!rows.length) return;
    const faces = await Promise.all(promptWindow().request(this.groupKey, this.title, rows));
    rows.forEach((row, i) => {
      if (faces[i]) this.batch.faces.set(row.ref, faces[i]);
    });
  }

  /** Run one action's real attack generation, its rolls taking the entered faces. */
  run(prefix, actionUse, fn) {
    return withContext(this.#context(prefix, actionUse), fn);
  }
}

/** API: a session other modules drive; null when this user isn't rolling manually at all. */
export function attackSession(options) {
  return isPermitted() ? new AttackSession(options) : null;
}

export function registerBatches() {
  libWrapper.register(
    MODULE_ID,
    "pf1.actionUse.ActionUse.prototype.generateChatAttacks",
    async function (wrapped, ...args) {
      count("generateChatAttacks");
      const session = new AttackSession();
      await session.preview("", this, generate);
      await session.prompt();
      return session.run("", this, () => wrapped(...args));
    },
    "WRAPPER"
  );
}

/** PF1's own attack loop, as `generateChatAttacks` picks it. */
function generate(use) {
  if (use.shared.action.hasAttack) return use.addAttacks();
  if (use.shared.action.hasDamage) return use.addDamage();
}

/**
 * A copy of an ActionUse whose shared data, rollData and attack list are copies: writes from PF1
 * and other modules' wrappers during a preview land on them.
 */
export function copyActionUse(actionUse) {
  const shared = actionUse.shared;
  const rollData = foundry.utils.deepClone(shared.rollData);
  rollData[PREVIEW_FLAG] = true;
  const copy = Object.assign(Object.create(Object.getPrototypeOf(shared)), shared, {
    rollData,
    chatAttacks: [],
    attacks: (shared.attacks ?? []).map(copyAttack),
  });
  // `shared` is a non-writable own property on ActionUse, so it is shadowed by definition.
  return Object.create(actionUse, { shared: { value: copy } });
}

/** A shallow copy of one attack entry, keeping its class. */
export function copyAttack(atk) {
  return Object.assign(Object.create(Object.getPrototypeOf(atk)), atk);
}

/**
 * Rows in roll order. Confirmation and crit damage rows depend on the attack's d20 and are
 * dropped when that d20 isn't asked for (they prompt late if PF1 rolls them).
 */
function buildRows(batch) {
  const rows = [];
  for (const slot of batch.slots.values()) {
    const row = { ...slot };
    if (slot.conditional) {
      const threat = batch.threats.get(slot.attackKey);
      if (!threat || !batch.slots.has(threat.ref) || !Number.isFinite(threat.critRange)) continue;
      row.conditional = { ref: threat.ref, critRange: threat.critRange };
      row.label = game.i18n.format("MANUALROLLS.Label.OnThreat", { what: slot.label, range: threat.critRange });
    } else {
      row.conditional = null;
    }
    rows.push(row);
  }
  return rows;
}
