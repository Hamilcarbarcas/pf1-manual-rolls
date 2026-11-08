/**
 * "Manual roll" checkbox in PF1's roll dialogs, defaulting to the global toggle. DESIGN.md §4.3.
 * The inputs carry no `name`, so the dialogs' own form handling never sees them.
 */

import { isEnabled, isPermitted } from "./settings.mjs";
import { getRollChoice, getSharedChoice, setRollChoice, setSharedChoice } from "./context.mjs";
import { currentInitiativeCall } from "./expect.mjs";

const MARK = "data-pf1mr-manual";

export function registerDialogs() {
  Hooks.on("renderDialogV2", (app, element) => {
    try {
      onRenderDialogV2(app, element);
    } catch (err) {
      console.error("pf1-manual-rolls | adding the Manual roll checkbox failed:", err);
    }
  });
  Hooks.on("renderAttackDialog", (app, html) => {
    try {
      onRenderAttackDialog(app, html);
    } catch (err) {
      console.error("pf1-manual-rolls | adding the Manual roll checkbox failed:", err);
    }
  });
}

function onRenderDialogV2(app, element) {
  if (!isPermitted()) return;
  const form = element?.querySelector("form");
  if (!form || form.querySelector(`[${MARK}]`)) return;

  const roll = app.options.roll;
  if (roll instanceof pf1.dice.D20RollPF) {
    form.append(checkboxGroup(getRollChoice(roll) ?? isEnabled(), (value) => setRollChoice(roll, value)));
    return;
  }

  // Initiative's dialog has no roll; the choice applies to the whole rollInitiative call.
  const call = currentInitiativeCall();
  if (call && app.options.subject?.core === "init") {
    form.append(checkboxGroup(call.choice ?? isEnabled(), (value) => (call.choice = value)));
  }
}

function onRenderAttackDialog(app, html) {
  if (!isPermitted() || !app.shared) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const flags = root?.querySelector(".form-group.flags");
  if (!flags || flags.querySelector(`[${MARK}]`)) return;

  const label = document.createElement("label");
  label.className = "checkbox";
  const input = checkbox(getSharedChoice(app.shared) ?? isEnabled(), (value) => setSharedChoice(app.shared, value));
  label.append(input, ` ${game.i18n.localize("MANUALROLLS.Dialog.ManualRoll")}`);
  flags.append(label);
}

function checkboxGroup(checked, onChange) {
  const group = document.createElement("div");
  group.className = "form-group";
  const label = document.createElement("label");
  label.textContent = game.i18n.localize("MANUALROLLS.Dialog.ManualRoll");
  const fields = document.createElement("div");
  fields.className = "form-fields";
  fields.append(checkbox(checked, onChange));
  group.append(label, fields);
  return group;
}

function checkbox(checked, onChange) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute(MARK, "");
  input.checked = checked;
  input.addEventListener("change", (event) => {
    event.stopPropagation();
    onChange(input.checked);
  });
  return input;
}
