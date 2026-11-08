import { MODULE_ID } from "./const.mjs";
import { loadSettings, registerKeybindings, registerSettings, isEnabled, setEnabled } from "./settings.mjs";
import { registerResolver } from "./resolver.mjs";
import { registerToggle } from "./toggle.mjs";
import { registerContext } from "./context.mjs";
import { registerDialogs } from "./dialogs.mjs";
import { registerBatches } from "./batch.mjs";
import { expect, registerInitiative } from "./expect.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerKeybindings();

  if (!game.modules.get("lib-wrapper")?.active) {
    console.error(`${MODULE_ID} | libWrapper is not active; manual rolls are disabled.`);
    return;
  }
  registerResolver();
  registerContext();
  registerBatches();
  registerInitiative();
  registerToggle();
  registerDialogs();
  game.pf1ManualRolls = { isEnabled, setEnabled, expect };
});

Hooks.once("setup", () => loadSettings());
