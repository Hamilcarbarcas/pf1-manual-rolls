/**
 * The chat-bar toggle and its die filter. DESIGN.md §4.1.
 * `#chat-controls` is one element that core moves between the sidebar and the floating
 * notifications, so the button is injected once and travels with it.
 */

import { DIE_KEYS, OTHER_DIE_ICON } from "./const.mjs";
import {
  allowedDice, isEnabled, isPermitted, onSettingsChange, setDieAllowed, setEnabled,
} from "./settings.mjs";

const BUTTON_ID = "pf1-manual-rolls-toggle";
const FILTER_ID = "pf1-manual-rolls-filter";

export function registerToggle() {
  Hooks.on("renderChatInput", (_app, elements) => inject(elements["#chat-controls"], elements["#roll-privacy"]));
  // The controls may already be in place by the time `ready` fires.
  Hooks.once("ready", () => inject(document.getElementById("chat-controls"), document.getElementById("roll-privacy")));
  onSettingsChange(refresh);
}

function inject(controls, privacy) {
  if (!controls || !privacy) return;
  let button = document.getElementById(BUTTON_ID);
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.id = BUTTON_ID;
    button.className = "ui-control icon fa-solid fa-dice-d20";
    button.ariaLabel = game.i18n.localize("MANUALROLLS.Toggle.Label");
    button.addEventListener("click", () => setEnabled(!isEnabled()));
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openFilter(button);
    });
  }
  if (button.previousElementSibling !== privacy) privacy.after(button);
  refresh();
}

function refresh() {
  const button = document.getElementById(BUTTON_ID);
  if (!button) return;
  button.hidden = !isPermitted();
  button.ariaPressed = String(isEnabled());
  const filtered = DIE_KEYS.length !== allowedDice().size;
  button.classList.toggle("filtered", filtered);
  button.dataset.tooltip = game.i18n.localize(
    isEnabled() ? "MANUALROLLS.Toggle.TooltipOn" : "MANUALROLLS.Toggle.TooltipOff"
  );
}

/** A small popover of die checkboxes beside the button. Closes on outside click or Escape. */
function openFilter(button) {
  document.getElementById(FILTER_ID)?.remove();
  const allowed = allowedDice();

  const popover = document.createElement("div");
  popover.id = FILTER_ID;
  popover.className = "themed theme-dark";
  const title = document.createElement("h4");
  title.textContent = game.i18n.localize("MANUALROLLS.Filter.Title");
  popover.append(title);

  for (const key of DIE_KEYS) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = allowed.has(key);
    box.addEventListener("change", () => setDieAllowed(key, box.checked));
    const icon = CONFIG.Dice.fulfillment.dice[key]?.icon ?? OTHER_DIE_ICON;
    const text = key === "other" ? game.i18n.localize("MANUALROLLS.Filter.Other") : key;
    label.append(box);
    label.insertAdjacentHTML("beforeend", `${icon}<span>${text}</span>`);
    popover.append(label);
  }

  document.body.append(popover);
  const rect = button.getBoundingClientRect();
  const { width, height } = popover.getBoundingClientRect();
  popover.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - width - 4))}px`;
  popover.style.top = `${Math.max(4, rect.top - height - 4)}px`;

  const dismiss = (event) => {
    if (event.type === "keydown" && event.key !== "Escape") return;
    if (event.type === "pointerdown" && popover.contains(event.target)) return;
    popover.remove();
    document.removeEventListener("pointerdown", dismiss, true);
    document.removeEventListener("keydown", dismiss, true);
  };
  document.addEventListener("pointerdown", dismiss, true);
  document.addEventListener("keydown", dismiss, true);
}
