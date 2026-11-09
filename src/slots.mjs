/**
 * Slots: expected dice, keyed by what they are for rather than by the Roll that uses them.
 * DESIGN.md §6.2, §6.5.
 *
 * Term key: `{base}:d{faces}:{k}`, k = k-th die of that size in its Roll.
 * Base: `{p}a{i}:attack` / `{p}a{i}:confirm` for a D20RollPF in an attack context;
 * `{p}a{i}:damage:{pass}:{part}` / `{p}a{i}:critDamage:{pass}:{part}` for a DamageRoll in a damage
 * context. `{p}` is the action's prefix when one batch covers several actions (§11.5).
 * An inner Roll evaluated while a damage part rolls (PF1's `sizeRoll()` result) is keyed under
 * that part: `{part base}:n{k}` (§11.7).
 * A replacement Roll for the same job (roll-bonuses Finesse/Agile, metamagic) lands on the same key,
 * so it reuses the faces instead of prompting again.
 */

import { collectDice, dieIcon, keepOf } from "./decide.mjs";

export class Batch {
  /** @type {Map<string, object>} termKey → slot recorded by the preview */
  slots = new Map();

  /** @type {Map<string, number[]>} termKey → faces, entered up front or at a late prompt */
  faces = new Map();

  /** @type {Map<string, {ref: string, critRange: number}>} attack key → its d20 and threat range */
  threats = new Map();

  /**
   * Records every manual term of a preview Roll as a slot. A later Roll on the same key
   * (a replacement) overwrites it: that is the one PF1 keeps.
   * @param {Roll} roll
   * @param {object} ctx
   * @param {Map<DiceTerm, string>} termKeys
   * @param {(term: DiceTerm) => boolean} isManual
   * @param {(term: DiceTerm) => string} labelOf
   */
  record(roll, ctx, termKeys, isManual, labelOf) {
    for (const [term, ref] of termKeys) {
      if (!ref || !isManual(term)) continue;
      this.slots.set(ref, {
        ref,
        label: labelOf(term),
        kind: ctx.kind,
        faces: term.faces,
        denomination: `d${term.faces}`,
        icon: dieIcon(term),
        count: Math.abs(term.number),
        keep: keepOf(term),
        attackKey: ctx.attackKey,
        conditional: /:(confirm|critDamage):/.test(ref),
        randomFace: () => term.randomFace(),
      });
    }

    const d20 = roll.terms[0];
    if (ctx.kind === "attack" && roll instanceof pf1.dice.D20RollPF && termKeys.get(d20)) {
      this.threats.set(ctx.attackKey, { ref: termKeys.get(d20), critRange: Number(roll.options?.critical) });
    }
  }
}

/**
 * Slot keys for each term of `collectDice(roll.terms)`, or null when the Roll has no slot.
 * Call once per Roll: a damage Roll claims its part position in the current pass.
 */
export function slotKeys(roll, ctx) {
  const base = slotBase(roll, ctx);
  return base ? keysFor(base, collectDice(roll.terms)) : null;
}

/** `{base}:d{faces}:{k}` per term. */
export function keysFor(base, terms) {
  const seen = {};
  return terms.map((term) => {
    const k = (seen[term.faces] = (seen[term.faces] ?? -1) + 1);
    return `${base}:d${term.faces}:${k}`;
  });
}

function slotBase(roll, ctx) {
  if (!ctx?.slotBase) return null;
  if (/:(attack|confirm)$/.test(ctx.slotBase)) {
    return roll instanceof pf1.dice.D20RollPF ? ctx.slotBase : null;
  }
  const pass = ctx.pass;
  if (!pass) return null;
  if (!(roll instanceof pf1.dice.DamageRoll)) {
    if (!pass.current) return null;
    return `${ctx.slotBase}:${pass.index}:${pass.currentPart}:n${pass.nested++}`;
  }

  let part;
  if (pass.next < pass.parts.length) {
    part = pass.next++;
    pass.rolls[part] = roll;
  } else {
    // A replacement after PF1's loop. Same options copy → same damageType array; else same dice.
    part = pass.rolls.findIndex((r) => r?.options?.damageType === roll.options?.damageType);
    if (part < 0) part = pass.rolls.findIndex((r) => r && sameDice(r, roll));
    if (part < 0) return null;
  }
  // Inner rolls that follow belong to this part, replacement included, so they share keys.
  pass.current = roll;
  pass.currentPart = part;
  pass.nested = 0;
  return `${ctx.slotBase}:${pass.index}:${part}`;
}

function sameDice(a, b) {
  const sig = (roll) => collectDice(roll.terms).map((t) => t.faces).join(",");
  return sig(a) === sig(b);
}
