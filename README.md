# PF1 Manual Rolls

**Manifest URL:** `https://github.com/Hamilcarbarcas/pf1-manual-rolls/releases/latest/download/module.json`

## Requirements

- Foundry VTT v13
- Pathfinder 1e system v11
- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)

## Contents

- [Overview](#overview)
- [The toggle](#the-toggle)
  - [Choosing dice](#choosing-dice)
- [The prompt window](#the-prompt-window)
- [Configure Dice](#configure-dice)

## Overview

For playing at a physical table with real dice. Turn manual rolls on, and every roll you make asks
you for the faces you threw instead of rolling them. The roll then goes through the system as
usual: same dialogs, same chat card, same bonuses.

## The toggle

The die button in the chat bar, next to the roll-mode buttons, turns manual rolls on and off. It's
highlighted while on, and your choice is remembered. Players only see it if they have core's
**Make Manual Rolls** permission (Trusted Players by default).

The same toggle is available as a keybinding under Configure Controls. It has no default key.

### Choosing dice

Right-click the button to pick which dice you roll by hand: d4, d6, d8, d10, d12, d20, d100, and
Other for anything else (d2, d3...). Unticked dice roll digitally even with the toggle on. A small
dot on the button shows that some dice are excluded.

## The prompt window

When a roll needs manual dice, a window opens listing them, one row per group of dice with a box
per die.

- Type each value. Once a value is complete, the cursor moves to the next box.
- On a d10, type 0 for 10. On a d100, type 00 for 100.
- **Enter** or **Submit** sends the group. Boxes left empty roll digitally.
- Closing the window submits everything in it the same way.
- An exploding or rerolled die asks for its extra value as it comes up.

The window closes once nothing is waiting, and opens again for the next roll.

## Configure Dice

Core's **Configure Dice** settings are ignored while this module is active: the toggle and its die
filter decide what is rolled by hand. Nothing in those settings is changed, so disabling the module
brings them back as they were.

One exception: if Configure Dice is set to a connected-dice method from another module (not
Manual), that module's resolver is used instead.
