/**
 * The shared prompt window: groups of rows, one input per die. DESIGN.md §5.
 *
 * Typed values live in the row model, so a re-render (a group arriving or leaving) loses nothing.
 * Each row resolves on its own, which is what lets a late row join a group that is still open.
 */

import { MODULE_ID } from "./const.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @typedef PromptRow
 * @property {string} label
 * @property {string} kind          One of KINDS.
 * @property {number} faces
 * @property {string} denomination  Shown as the placeholder ("d20").
 * @property {string} icon          Die icon HTML.
 * @property {number} count         Inputs to show.
 * @property {() => number} randomFace  Fills an input left empty.
 * @property {"reroll"|"explode"} [extra]  Marks a single die added by a modifier.
 */

class PromptWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf1-manual-rolls-prompt",
    classes: ["pf1-manual-rolls"],
    window: {
      title: "MANUALROLLS.Window.Title",
      icon: "fa-solid fa-dice-d20",
    },
    position: { width: 440, height: "auto" },
    actions: {
      submitGroup: PromptWindow.#onSubmitGroup,
    },
  };

  static PARTS = {
    groups: { template: `modules/${MODULE_ID}/src/templates/prompt.hbs` },
  };

  /** @type {Map<string, {id: string, key: string, title: string, rows: object[]}>} */
  #groups = new Map();

  /** Name of the input to focus after the next render. */
  #focus = null;

  /**
   * Show rows and wait for their faces. Rows join the open group with the same key, if any.
   * @param {string} key
   * @param {string} title
   * @param {PromptRow[]} rows
   * @returns {Promise<number[]>[]}  One promise per row, resolving to its faces.
   */
  request(key, title, rows) {
    let group = [...this.#groups.values()].find((g) => g.key === key);
    if (!group) {
      group = { id: foundry.utils.randomID(), key, title, rows: [] };
      this.#groups.set(group.id, group);
    }
    const promises = rows.map((spec) => {
      const row = { ...spec, id: foundry.utils.randomID(), values: Array(spec.count).fill("") };
      group.rows.push(row);
      return new Promise((resolve) => (row.resolve = resolve));
    });
    this.render({ force: true, position: { height: "auto" } });
    return promises;
  }

  /** Fills the first empty input for a die of this size, for externally reported results. */
  registerResult(faces, result) {
    for (const group of this.#groups.values()) {
      for (const row of group.rows) {
        const i = row.faces === faces ? row.values.indexOf("") : -1;
        if (i < 0) continue;
        row.values[i] = String(result);
        this.render();
        return true;
      }
    }
    return false;
  }

  /** @override */
  async _prepareContext(_options) {
    const groups = [...this.#groups.values()].map((group) => ({
      id: group.id,
      title: group.title,
      rows: group.rows.map((row) => ({
        id: row.id,
        label: row.label,
        kind: row.kind,
        icon: row.icon,
        denomination: row.denomination,
        faces: row.faces,
        extraIcon: { reroll: "fa-arrow-rotate-right", explode: "fa-burst" }[row.extra] ?? null,
        inputs: row.values.map((value, index) => ({ name: `${row.id}.${index}`, value })),
      })),
    }));
    return { groups };
  }

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.addEventListener("input", this.#onInput.bind(this));
    this.element.addEventListener("keydown", this.#onKeyDown.bind(this));
    this.element.addEventListener("focusin", (event) => {
      if (event.target.matches?.("input[data-row-id]")) this.#focus = event.target.name;
    });
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const target =
      (this.#focus && this.element.querySelector(`input[name="${this.#focus}"]`)) ||
      [...this.element.querySelectorAll("input[data-row-id]")].find((input) => input.value === "");
    if (target) {
      target.focus();
      target.setSelectionRange(target.value.length, target.value.length);
    }
  }

  /**
   * Closing never strands a roll: open groups submit, empty inputs roll digitally. Groups that
   * arrive during the close animation stay, and their queued render reopens the window.
   * @override
   */
  async _preClose(options) {
    await super._preClose(options);
    for (const group of [...this.#groups.values()]) this.#submit(group, { force: true, closing: true });
  }

  #onInput(event) {
    const input = event.target;
    if (!input.matches("input[data-row-id]")) return;
    input.value = input.value.replace(/\D/g, "");
    input.classList.remove("invalid");
    const row = this.#row(input.dataset.rowId);
    if (!row) return;
    row.values[Number(input.dataset.index)] = input.value;
    if (isComplete(input.value, row.faces)) this.#focusNext(input);
  }

  #onKeyDown(event) {
    if (event.key !== "Enter") return;
    const section = event.target.closest?.("[data-group-id]");
    if (!section) return;
    event.preventDefault();
    const group = this.#groups.get(section.dataset.groupId);
    if (group) this.#submit(group);
  }

  static #onSubmitGroup(_event, target) {
    const group = this.#groups.get(target.closest("[data-group-id]")?.dataset.groupId);
    if (group) this.#submit(group);
  }

  /** Next input in the same group, else that group's submit button. */
  #focusNext(input) {
    const section = input.closest("[data-group-id]");
    const inputs = [...section.querySelectorAll("input[data-row-id]")];
    const next = inputs[inputs.indexOf(input) + 1] ?? section.querySelector("[data-action=submitGroup]");
    next?.focus();
  }

  /**
   * Resolve every row of a group. Unless forced, an invalid value blocks the submit and is marked.
   * @param {object} group
   * @param {{force?: boolean, closing?: boolean}} [options]  Forced: invalid values roll digitally
   *   too. Closing: the window is already on its way out, so no re-render.
   */
  #submit(group, { force = false, closing = false } = {}) {
    const faces = new Map();
    let firstInvalid = null;
    for (const row of group.rows) {
      const values = row.values.map((text) => parseFace(text, row.faces));
      values.forEach((value, index) => {
        if (!Number.isNaN(value) || force || firstInvalid) return;
        firstInvalid = this.element?.querySelector(`input[name="${row.id}.${index}"]`) ?? null;
      });
      faces.set(row, values);
    }
    if (firstInvalid) {
      firstInvalid.classList.add("invalid");
      firstInvalid.focus();
      ui.notifications.warn("MANUALROLLS.Window.Invalid", { localize: true });
      return;
    }

    this.#groups.delete(group.id);
    for (const [row, values] of faces) {
      row.resolve(values.map((value) => (value === null || Number.isNaN(value) ? row.randomFace() : value)));
    }
    this.#focus = null;
    if (closing || !this.rendered) return;
    if (this.#groups.size) this.render({ position: { height: "auto" } });
    else this.close();
  }

  #row(id) {
    for (const group of this.#groups.values()) {
      const row = group.rows.find((r) => r.id === id);
      if (row) return row;
    }
    return null;
  }
}

/**
 * "" = empty (roll digitally), NaN = invalid. A 0 means 10 on a d10 and 100 on a d100 ("00"),
 * as the physical dice read.
 */
function parseFace(text, faces) {
  if (text === "") return null;
  let value = Number(text);
  if (value === 0 && (faces === 10 || faces === 100)) value = faces;
  return Number.isInteger(value) && value >= 1 && value <= faces ? value : NaN;
}

/** True once no further digit could make a valid face. §5 keyboard entry. */
function isComplete(text, faces) {
  if (!text) return false;
  if (faces === 10) return true;
  if (faces === 100) return text.length >= 2;
  return Number(text) * 10 > faces || text.length >= String(faces).length;
}

let instance = null;

export function promptWindow() {
  instance ??= new PromptWindow();
  return instance;
}
