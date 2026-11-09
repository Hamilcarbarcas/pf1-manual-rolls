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
  - [Per-roll choice](#per-roll-choice)
- [The prompt window](#the-prompt-window)
  - [What the rows show](#what-the-rows-show)
  - [Attacks in one prompt](#attacks-in-one-prompt)
  - [Initiative and group saves](#initiative-and-group-saves)
- [Configure Dice](#configure-dice)
- [API](#api)

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

### Per-roll choice

PF1's roll dialogs get a **Manual roll** checkbox: the check dialog (skills, saves, ability
checks, caster level, concentration, BAB), the attack dialog, and the initiative dialog. It starts
at the toggle's setting. Tick it to roll this one by hand with the toggle off, or untick it to roll
this one digitally with the toggle on. The die filter applies either way. A roll that skips its
dialog (Shift-click, or auto-roll) follows the toggle.

## The prompt window

When a roll needs manual dice, a window opens listing them, one row per group of dice with a box
per die.

- Type each value. Once a value is complete, the cursor moves to the next box.
- On a d10, type 0 for 10. On a d100, type 00 for 100.
- **Enter** or **Submit** sends the group. Boxes left empty roll digitally.
- On the chat card, dice you typed show the keyboard icon. A group of dice with any box left empty
  doesn't, since it wasn't all rolled by hand.
- Closing the window submits everything in it the same way.
- An exploding or rerolled die asks for its extra value as it comes up.

The window closes once nothing is waiting, and opens again for the next roll.

### What the rows show

Each group is headed by who is rolling and what: the character and item for an attack, the
character for a check, the combatant for initiative. Each row names what its dice are for: the
attack ("Attack", "Attack #2", "Critical Confirmation"), the damage by its flavor or damage
type ("Fire", "Sneak Attack", "Critical: Slashing"), or the check ("Acrobatics Check"). A colored bar
on the left marks the kind of roll: attack, confirmation, damage, healing, skill, save, ability,
initiative, caster level and concentration, or other.

### Attacks in one prompt

Using an attack, spell or other action asks for all of its dice at once, before anything is rolled:
every attack's d20, every damage die, sneak attack and other extra damage, for a full attack too.
Throw them all, type them in, submit once.

- **Critical rows** (the confirmation and critical damage) start dimmed, and Tab skips them. They
  light up when the d20 you typed for that attack is a threat, since that is when they get rolled.
  If they're still dimmed when you submit, they aren't used.
- **Keep highest / keep lowest** dice (2d20kh from Lucky, for example) are one row with a box per
  die. The die that counts is outlined as you type.
- **Nothing you type is wasted.** Some effects quietly re-roll an attack or damage roll with a new
  formula (roll-bonuses' Weapon Finesse and Agile, metamagic). The dice you typed are reused for the
  new formula. When Critical Effects defers critical confirmations, PF1's own confirmation is
  thrown away, so it isn't asked for; the confirmation's Roll button on the card asks for it
  instead.
- Anything the window couldn't foresee (a die that explodes, a skill check made during the attack)
  is asked for in a follow-up row under the same heading.
- With [PF1 Sequential Attacks](https://github.com/Hamilcarbarcas/pf1-sequential-attacks), **Roll
  Next Attack** asks for that attack's dice in one prompt, and **Roll All Remaining** asks for every
  remaining attack's dice in one prompt, both weapons of a two-weapon routine included.

Critical damage that Critical Effects defers is rolled later, from its own button, and asked for
then.

### Initiative and group saves

Rolling initiative for several combatants at once (Roll All, Roll NPCs) asks for every d20 in one
prompt, one row per combatant, after the initiative dialog. The initiative dialog's **Manual roll**
box covers the whole batch.

With [PF1 Roll Requests](https://github.com/Hamilcarbarcas/pf1-roll-requests), a card's **Roll All**
and **Roll NPCs** do the same for saves and checks: one row per token, typed in once.

If a roll turns out to need more dice than the prompt asked for (a Lucky creature rolling 2d20),
the extra die is asked for in a follow-up row.

## Configure Dice

Core's **Configure Dice** settings are ignored while this module is active: the toggle and its die
filter decide what is rolled by hand. Nothing in those settings is changed, so disabling the module
brings them back as they were.

One exception: if Configure Dice is set to a connected-dice method from another module (not
Manual), that module's resolver is used instead.

## API

`game.pf1ManualRolls.expect(rolls, fn, { title })` asks for the dice of several rolls in one prompt,
then runs `fn`, which makes the rolls. Each roll made inside `fn` takes the faces typed for its row.
When manual rolls are off for the user, it just runs `fn`.

```js
await game.pf1ManualRolls.expect(
  tokens.map((t) => ({
    key: t.id,                 // unique within the call
    label: t.name,             // row label
    kind: "save",              // row color: attack, damage, skill, save, ability, initiative, other...
    formula: "1d20",           // only its dice matter
    match: { token: t.id, actor: t.actor.id }, // who rolls it, for PF1 checks and saves
  })),
  async () => {
    for (const t of tokens) await t.actor.rollSavingThrow("fort", { skipDialog: true });
  },
  { title: "Fortitude" }
);
```

A roll is matched to its row by who rolls it (the speaker's token, else actor) when PF1 says so,
otherwise to the next unused row with the same dice. `game.pf1ManualRolls.isEnabled()` and
`setEnabled(value)` read and set the toggle.

For modules that build attacks themselves instead of through PF1's own full attack,
`game.pf1ManualRolls.attackSession()` gives one prompt across any number of actions:

```js
const session = game.pf1ManualRolls?.attackSession?.(); // null when the user can't roll manually
if (session) {
  // Same code that builds the attacks, run on a copy: nothing is rolled for real.
  await session.preview("main:", actionUse, (copy) => buildAttacks(copy));
  await session.prompt();
  await session.run("main:", actionUse, () => buildAttacks(actionUse));
} else await buildAttacks(actionUse);
```

The prefix keeps each action's dice apart within one session. `copyAttack(atk)` copies an attack
entry for the preview.
