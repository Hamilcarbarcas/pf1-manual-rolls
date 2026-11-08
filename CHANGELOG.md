# Changelog

All notable changes to this module are documented here. Release notes are taken from the section
matching each release tag.

## [Unreleased]

### Added
- **Manual Rolls toggle** in the chat bar, beside the roll-mode buttons. Click to turn manual rolls
  on or off; the choice is saved. Right-click to choose which dice you roll by hand. Shown only to
  users with the Make Manual Rolls permission. Also on a keybinding (no default key).
- **Prompt window** for physical dice: one row per die group with its icon, label and one box per
  die. Typing a full value moves to the next box; Enter submits. Empty boxes roll digitally. A 0
  reads as 10 on a d10, and 00 as 100 on a d100.
- Extra dice from exploding and rerolling ask for their value too.
- Overrides core's Configure Dice: while the module is active, the toggle and its die filter decide
  which dice are manual.

Earlier releases: see the [GitHub Releases page](https://github.com/Hamilcarbarcas/pf1-manual-rolls/releases).
