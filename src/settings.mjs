/**
 * Client settings and the toggle keybinding. DESIGN.md §4.1.
 * Settings are cached here: the manual decision runs for every die rolled.
 */

import { MODULE_ID, SETTINGS, DIE_KEYS } from "./const.mjs";

let enabled = false;
let dice = new Set(DIE_KEYS);
const listeners = new Set();

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.enabled, {
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
    onChange: (value) => {
      enabled = value;
      notify();
    },
  });

  game.settings.register(MODULE_ID, SETTINGS.dice, {
    scope: "client",
    config: false,
    type: Array,
    default: [...DIE_KEYS],
    onChange: (value) => {
      dice = new Set(value);
      notify();
    },
  });
}

export function registerKeybindings() {
  game.keybindings.register(MODULE_ID, "toggle", {
    name: "MANUALROLLS.Keybinding.Toggle",
    editable: [],
    onDown: () => {
      if (!isPermitted()) return false;
      setEnabled(!enabled).then(() => {
        ui.notifications.info(enabled ? "MANUALROLLS.Toggle.NowOn" : "MANUALROLLS.Toggle.NowOff", { localize: true });
      });
      return true;
    },
  });
}

/** Called at `setup`, once settings storage is ready. */
export function loadSettings() {
  enabled = game.settings.get(MODULE_ID, SETTINGS.enabled);
  dice = new Set(game.settings.get(MODULE_ID, SETTINGS.dice));
}

export const isPermitted = () => game.user?.hasPermission("MANUAL_ROLLS") ?? false;
export const isEnabled = () => enabled;
export const isDieAllowed = (key) => dice.has(key);
export const allowedDice = () => new Set(dice);

export function setEnabled(value) {
  return game.settings.set(MODULE_ID, SETTINGS.enabled, !!value);
}

export function setDieAllowed(key, allowed) {
  const next = new Set(dice);
  if (allowed) next.add(key);
  else next.delete(key);
  return game.settings.set(MODULE_ID, SETTINGS.dice, DIE_KEYS.filter((k) => next.has(k)));
}

/** Runs `fn` after either setting changes. */
export function onSettingsChange(fn) {
  listeners.add(fn);
}

function notify() {
  for (const fn of listeners) fn();
}
