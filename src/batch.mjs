/**
 * Item-use batches: every die an action needs, asked for in one prompt before PF1 rolls.
 * DESIGN.md §6.2.
 *
 * A preview pass runs PF1's own `addAttacks` / `addDamage` on a copy of the shared data, with the
 * resolver in preview mode recording each manual term as a slot. The prompt fills the slots, then
 * the real pass runs and each Roll takes its faces by slot key.
 */

import { MODULE_ID, PREVIEW_FLAG } from "./const.mjs";
import { isEnabled, isPermitted } from "./settings.mjs";
import { actorTitle, getSharedChoice, withContext } from "./context.mjs";
import { promptWindow } from "./prompt-window.mjs";
import { Batch } from "./slots.mjs";

export function registerBatches() {
  libWrapper.register(
    MODULE_ID,
    "pf1.actionUse.ActionUse.prototype.generateChatAttacks",
    async function (wrapped, ...args) {
      const ctx = {
        title: actorTitle(this),
        choice: getSharedChoice(this.shared),
        groupKey: foundry.utils.randomID(),
      };
      if (isPermitted() && (ctx.choice ?? isEnabled())) {
        ctx.batch = new Batch();
        await prepare(this, ctx);
      }
      return withContext(ctx, () => wrapped(...args));
    },
    "WRAPPER"
  );
}

/** Preview, then prompt. A failed preview leaves an empty batch: rolls prompt one by one. */
async function prepare(actionUse, ctx) {
  try {
    await withContext({ ...ctx, preview: true }, () => preview(actionUse));
  } catch (err) {
    console.error(`${MODULE_ID} | previewing the action's dice failed; prompting per roll:`, err);
    ctx.batch.slots.clear();
    ctx.batch.threats.clear();
    return;
  }

  const rows = buildRows(ctx.batch);
  if (!rows.length) return;
  const faces = await Promise.all(promptWindow().request(ctx.groupKey, ctx.title, rows));
  rows.forEach((row, i) => {
    if (faces[i]) ctx.batch.faces.set(row.ref, faces[i]);
  });
}

/**
 * PF1's own attack generation on copies: shared, its rollData and its attack list. Writes from
 * PF1 and other modules' wrappers land on the copies.
 */
async function preview(actionUse) {
  const shared = actionUse.shared;
  const rollData = foundry.utils.deepClone(shared.rollData);
  rollData[PREVIEW_FLAG] = true;

  const copy = Object.assign(Object.create(Object.getPrototypeOf(shared)), shared, {
    rollData,
    chatAttacks: [],
    attacks: (shared.attacks ?? []).map((atk) => Object.assign(Object.create(Object.getPrototypeOf(atk)), atk)),
  });
  // `shared` is a non-writable own property on ActionUse, so it is shadowed by definition.
  const use = Object.create(actionUse, { shared: { value: copy } });

  if (shared.action.hasAttack) await use.addAttacks();
  else if (shared.action.hasDamage) await use.addDamage();
}

/**
 * Rows in PF1's roll order. Confirmation and crit damage rows depend on the attack's d20 and are
 * dropped when that d20 isn't asked for (they prompt late if PF1 rolls them).
 */
function buildRows(batch) {
  const rows = [];
  for (const slot of batch.slots.values()) {
    const row = { ...slot };
    if (slot.conditional) {
      const threat = batch.threats.get(slot.attackIndex);
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
