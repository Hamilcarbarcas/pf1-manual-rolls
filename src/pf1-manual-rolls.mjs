import { MODULE_ID } from "./const.mjs";
import { loadSettings, registerKeybindings, registerSettings, isEnabled, setEnabled } from "./settings.mjs";
import { registerResolver } from "./resolver.mjs";
import { registerToggle } from "./toggle.mjs";
import { registerContext } from "./context.mjs";
import { registerDialogs } from "./dialogs.mjs";
import { attackSession, copyActionUse, copyAttack, registerBatches } from "./batch.mjs";
import { expect, registerInitiative } from "./expect.mjs";
import { diagnose, failedSteps, step } from "./diagnostics.mjs";

Hooks.once("init", () => {
  game.pf1ManualRolls = { isEnabled, setEnabled, expect, attackSession, copyActionUse, copyAttack, diagnose };
  step("settings", registerSettings);
  step("keybindings", registerKeybindings);

  if (!game.modules.get("lib-wrapper")?.active) {
    console.error(`${MODULE_ID} | libWrapper is not active; manual rolls are disabled.`);
    return;
  }
  // Each step stands alone, so one failure can't silently take the others down.
  step("resolver", registerResolver);
  step("context", registerContext);
  step("batches", registerBatches);
  step("initiative", registerInitiative);
  step("toggle", registerToggle);
  step("dialogs", registerDialogs);
});

Hooks.once("setup", () => step("loadSettings", loadSettings));

Hooks.once("ready", () => {
  const failed = failedSteps();
  if (failed.length) {
    ui.notifications.error(`${MODULE_ID}: startup failed (${failed.join(", ")}). See the console.`, { permanent: true });
  }
});
