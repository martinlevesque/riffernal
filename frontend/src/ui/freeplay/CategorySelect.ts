import { fetchCategories, createCategory, type CategoryData } from "../../api/SongApi.js";
import type { Song } from "../../utils/MidiParser.js";
import { reportError } from "../../utils/helpers.js";
import { DIFFICULTY_LEVELS, isDifficulty, DEFAULT_DIFFICULTY, type Difficulty } from "../../game/difficulty.js";

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
  private _listEl: HTMLElement;
  private _newCategoryInput: HTMLInputElement;
  private _createBtn: HTMLButtonElement;
  private _confirmBtn: HTMLButtonElement;
  private _skipBtn: HTMLButtonElement;
  private _titleInput: HTMLInputElement;
  private _artistInput: HTMLInputElement;
  private _difficultyEl: HTMLElement;
  private _selectedDifficulty: Difficulty = DEFAULT_DIFFICULTY;
  private _categories: CategoryData[] = [];
  private _selectedCategoryId: number | null = null;
  private _deps: CategorySelectDeps | null = null;

  constructor() {
    this._screen = document.getElementById("category-select-screen")!;
    this._listEl = document.getElementById("category-list")!;
    this._newCategoryInput = document.getElementById("new-category-name") as HTMLInputElement;
    this._createBtn = document.getElementById("btn-create-category") as HTMLButtonElement;
    this._confirmBtn = document.getElementById("category-select-confirm") as HTMLButtonElement;
    this._skipBtn = document.getElementById("category-select-skip") as HTMLButtonElement;
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
    this._confirmBtn.addEventListener("click", () => this._confirm());
    this._skipBtn.addEventListener("click", () => {
      this._selectedCategoryId = null;
      this._confirm();
    });
    this._screen.addEventListener("click", (e) => {
      if (e.target === this._screen) this._cancel();
    });
  }

  async show(deps: CategorySelectDeps, song?: Song, opts: CategorySelectShowOptions = {}): Promise<void> {
    this._deps = deps;
    this._selectedCategoryId = null;
    this._newCategoryInput.value = "";
    this._confirmBtn.disabled = !opts.hideCategories;

    const hideCats = opts.hideCategories;
    document.getElementById("category-list")!.classList.toggle("hidden", hideCats);
    document.getElementById("category-create")!.classList.toggle("hidden", hideCats);
    document.getElementById("category-select-count")!.classList.toggle("hidden", hideCats);
    document.getElementById("category-select-skip")!.classList.toggle("hidden", hideCats);

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
    this._renderList();
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

  private _renderList(): void {
    this._listEl.innerHTML = "";
    document.getElementById("category-select-count")!.textContent =
      this._categories.length === 0 ? "No categories yet" : `${this._categories.length} categor${this._categories.length === 1 ? "y" : "ies"}`;

    for (const cat of this._categories) {
      const li = document.createElement("li");
      li.className = "category-item";
      if (cat.id === this._selectedCategoryId) li.classList.add("selected");
      li.textContent = cat.name;
      li.addEventListener("click", () => {
        this._selectedCategoryId = cat.id;
        this._listEl.querySelectorAll(".category-item").forEach((el) => { el.classList.remove("selected"); });
        li.classList.add("selected");
        this._confirmBtn.disabled = false;
      });
      this._listEl.appendChild(li);
    }
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
      this._renderList();
      this._confirmBtn.disabled = false;
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