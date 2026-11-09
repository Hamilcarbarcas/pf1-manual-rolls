# Changelog

All notable changes to this module are documented here. Release notes are taken from the section
matching each release tag.

## [Unreleased]

### Added
- **Manual Rolls toggle** in the chat bar, beside the roll-mode buttons. Click to turn manual rolls
  on or off; the choice is saved. Right-click to choose which dice you roll by hand. Shown only to
  users with the Make Manual Rolls permission. Also on a keybinding (no default key).
- **Prompt window** for physical dice: one row per die group with its icon, label and one box per
  die. Typing a full value moves to the next box; Enter submits. Empty boxes roll digitally, and
  their dice don't get the manual-roll icon on the card. A 0 reads as 10 on a d10, and 00 as 100 on
  a d100.
- Extra dice from exploding and rerolling ask for their value too.
- **Manual roll** checkbox in PF1's check, attack and initiative dialogs, starting at the toggle's
  setting, to roll one roll by hand or digitally against the toggle.
- Prompt rows are labeled by what they're for (attack, confirmation, damage type or flavor, check)
  and color-coded by kind; groups are headed by the roller and item.
- **Attacks in one prompt:** using an action asks for every die it needs at once (all attacks,
  damage parts, extra damage), with critical confirmation and critical damage rows that light up on a
  threat. Keep-highest/lowest dice are one row with the kept die outlined.
- Re-rolled formulas (roll-bonuses Weapon Finesse and Agile, metamagic) reuse the dice already typed,
  and a confirmation that Critical Effects defers isn't asked for at attack time.
- **Initiative in one prompt:** rolling initiative for several combatants asks for every d20 at once,
  one row per combatant.
- **API:** `game.pf1ManualRolls.expect(rolls, fn, { title })` asks for the dice of several rolls in
  one prompt before running them. PF1 Roll Requests uses it for Roll All and Roll NPCs.
- **PF1 Sequential Attacks:** Roll Next Attack asks for the attack's dice in one prompt; Roll All
  Remaining asks for every remaining attack's dice, across all the tracker's actions, in one prompt.
  API for such modules: `game.pf1ManualRolls.attackSession()`.
- Overrides core's Configure Dice: while the module is active, the toggle and its die filter decide
  which dice are manual.

Earlier releases: see the [GitHub Releases page](https://github.com/Hamilcarbarcas/pf1-manual-rolls/releases).
