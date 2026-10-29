import { fetchCategories, createCategory, type CategoryData } from "../../api/SongApi.js";
import type { Song } from "../../utils/MidiParser.js";
import { reportError } from "../../utils/helpers.js";
import { DIFFICULTY_LEVELS, isDifficulty, DEFAULT_DIFFICULTY, type Difficulty } from "../../game/difficulty.js";

/** Sentinel option value — reveals the inline create-category row. Category
 *  ids are numeric strings, so this can never collide with a real option. */
const CREATE_OPTION_VALUE = "create";

export interface CategorySelectDeps {
  onConfirm: (categoryId: number | null, title: string, artist: string, difficulty: Difficulty) => void;
  onCancel: () => void;
}

export interface CategorySelectShowOptions {
  /** Guest imports skip categories (per-user server data). */
  hideCategories?: boolean;
}

export class CategorySelect {
  private _screen: HTMLElement;
  private _selectEl: HTMLSelectElement;
  private _createRow: HTMLElement;
  private _newCategoryInput: HTMLInputElement;
  private _createBtn: HTMLButtonElement;
  private _confirmBtn: HTMLButtonElement;
  private _titleInput: HTMLInputElement;
  private _artistInput: HTMLInputElement;
  private _difficultyEl: HTMLElement;
  private _selectedDifficulty: Difficulty = DEFAULT_DIFFICULTY;
  private _categories: CategoryData[] = [];
  private _selectedCategoryId: number | null = null;
  private _deps: CategorySelectDeps | null = null;

  constructor() {
    this._screen = document.getElementById("category-select-screen")!;
    this._selectEl = document.getElementById("import-song-category") as HTMLSelectElement;
    this._createRow = document.getElementById("category-create")!;
    this._newCategoryInput = document.getElementById("new-category-name") as HTMLInputElement;
    this._createBtn = document.getElementById("btn-create-category") as HTMLButtonElement;
    this._confirmBtn = document.getElementById("category-select-confirm") as HTMLButtonElement;
    this._titleInput = document.getElementById("import-song-title") as HTMLInputElement;
    this._artistInput = document.getElementById("import-song-artist") as HTMLInputElement;
    this._difficultyEl = document.getElementById("import-song-difficulty")!;

    this._createBtn.addEventListener("click", () => this._createNew());
    this._newCategoryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._createNew();
      }
    });
    this._selectEl.addEventListener("change", () => {
      if (this._selectEl.value === CREATE_OPTION_VALUE) {
        this._selectedCategoryId = null;
        this._createRow.classList.remove("hidden");
        this._newCategoryInput.focus();
        return;
      }

      this._selectedCategoryId = this._selectEl.value === "" ? null : Number(this._selectEl.value);
      this._createRow.classList.add("hidden");
    });
    this._confirmBtn.addEventListener("click", () => this._confirm());
    this._screen.addEventListener("click", (e) => {
      if (e.target === this._screen) this._cancel();
    });
  }

  async show(deps: CategorySelectDeps, song?: Song, opts: CategorySelectShowOptions = {}): Promise<void> {
    this._deps = deps;
    this._selectedCategoryId = null;
    this._newCategoryInput.value = "";

    const hideCats = opts.hideCategories;
    document.getElementById("import-song-category-field")!.classList.toggle("hidden", hideCats);
    this._createRow.classList.add("hidden");

    if (song) {
      this._titleInput.value = song.title;
      this._artistInput.value = song.artist || "";
    } else {
      this._titleInput.value = "";
      this._artistInput.value = "";
    }

    this._selectedDifficulty = song && isDifficulty(song.difficulty) ? song.difficulty : DEFAULT_DIFFICULTY;
    this._renderDifficultyOptions();

    if (!hideCats) await this._loadCategories();
    this._renderOptions();
    this._screen.classList.add("active");
    this._titleInput.focus();
  }

  hide(): void {
    this._screen.classList.remove("active");
  }

  private _cancel(): void {
    this.hide();
    const deps = this._deps;
    this._deps = null;
    deps?.onCancel();
  }

  private async _loadCategories(): Promise<void> {
    try {
      this._categories = await fetchCategories();
    } catch (err) {
      reportError("Failed to load categories", err);
      this._categories = [];
    }
  }

  private _renderOptions(): void {
    this._selectEl.innerHTML = "";

    const none = document.createElement("option");
    none.value = "";
    none.textContent = "No category";
    this._selectEl.appendChild(none);

    const create = document.createElement("option");
    create.value = CREATE_OPTION_VALUE;
    create.textContent = "Create category";
    this._selectEl.appendChild(create);

    for (const cat of this._categories) {
      const opt = document.createElement("option");
      opt.value = String(cat.id);
      opt.textContent = cat.name;
      this._selectEl.appendChild(opt);
    }

    const selected = this._selectedCategoryId;
    this._selectEl.value = selected !== null && this._categories.some((c) => c.id === selected) ? String(selected) : "";
  }

  private async _createNew(): Promise<void> {
    const name = this._newCategoryInput.value.trim();
    if (!name) return;
    try {
      const created = await createCategory(name);
      if (!this._categories.some((c) => c.id === created.id)) {
        this._categories.push(created);
        this._categories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      }
      this._selectedCategoryId = created.id;
      this._newCategoryInput.value = "";
      this._createRow.classList.add("hidden");
      this._renderOptions();
    } catch (err) {
      reportError("Failed to create category", err, { alert: true });
    }
  }

  private _renderDifficultyOptions(): void {
    this._difficultyEl.innerHTML = "";

    for (const level of DIFFICULTY_LEVELS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `pixel-chip difficulty-${level}${level === this._selectedDifficulty ? " selected" : ""}`;
      btn.textContent = level;
      btn.addEventListener("click", () => {
        this._selectedDifficulty = level;
        this._difficultyEl.querySelectorAll(".pixel-chip").forEach((el) => {
          el.classList.remove("selected");
        });
        btn.classList.add("selected");
      });
      this._difficultyEl.appendChild(btn);
    }
  }

  private _confirm(): void {
    this.hide();
    const deps = this._deps;
    this._deps = null;
    deps?.onConfirm(
      this._selectedCategoryId,
      this._titleInput.value.trim(),
      this._artistInput.value.trim(),
      this._selectedDifficulty,
    );
  }
}