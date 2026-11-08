import { MODULE_ID } from "./const.mjs";
import { loadSettings, registerKeybindings, registerSettings, isEnabled, setEnabled } from "./settings.mjs";
import { registerResolver } from "./resolver.mjs";
import { registerToggle } from "./toggle.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerKeybindings();

  if (!game.modules.get("lib-wrapper")?.active) {
    console.error(`${MODULE_ID} | libWrapper is not active; manual rolls are disabled.`);
    return;
  }
  registerResolver();
  registerToggle();
  game.pf1ManualRolls = { isEnabled, setEnabled };
});

Hooks.once("setup", () => loadSettings());
