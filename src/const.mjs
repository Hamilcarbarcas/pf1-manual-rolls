export const MODULE_ID = "pf1-manual-rolls";

export const SETTINGS = Object.freeze({
  enabled: "enabled",
  dice: "dice",
});

/** Filter keys, in display order. "other" covers any size not listed and non-Die terms (§4.1). */
export const DIE_KEYS = Object.freeze(["d4", "d6", "d8", "d10", "d12", "d20", "d100", "other"]);

/** Row kinds, each with a color token in the stylesheet (§5). */
export const KINDS = Object.freeze([
  "attack", "confirmation", "damage", "healing", "skill", "save", "ability", "initiative", "caster", "other",
]);

export const OTHER_DIE_ICON = '<i class="fa-solid fa-dice"></i>';
