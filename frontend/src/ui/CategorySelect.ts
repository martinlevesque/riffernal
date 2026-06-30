import { fetchCategories, createCategory, type CategoryData } from "../api/SongApi.js";
import type { Song } from "../utils/MidiParser.js";

export class CategorySelect {
  private screen: HTMLElement;
  private listEl: HTMLElement;
  private newCategoryInput: HTMLInputElement;
  private createBtn: HTMLButtonElement;
  private confirmBtn: HTMLButtonElement;
  private skipBtn: HTMLButtonElement;
  private titleInput: HTMLInputElement;
  private artistInput: HTMLInputElement;
  private categories: CategoryData[] = [];
  private selectedCategoryId: number | null = null;
  onConfirm: ((categoryId: number | null, title: string, artist: string) => void) | null = null;
  onCancel: (() => void) | null = null;

  constructor() {
    this.screen = document.getElementById("category-select-screen")!;
    this.listEl = document.getElementById("category-list")!;
    this.newCategoryInput = document.getElementById("new-category-name") as HTMLInputElement;
    this.createBtn = document.getElementById("btn-create-category") as HTMLButtonElement;
    this.confirmBtn = document.getElementById("category-select-confirm") as HTMLButtonElement;
    this.skipBtn = document.getElementById("category-select-skip") as HTMLButtonElement;
    this.titleInput = document.getElementById("import-song-title") as HTMLInputElement;
    this.artistInput = document.getElementById("import-song-artist") as HTMLInputElement;

    this.createBtn.addEventListener("click", () => this._createNew());
    this.newCategoryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._createNew();
      }
    });
    this.confirmBtn.addEventListener("click", () => this._confirm());
    this.skipBtn.addEventListener("click", () => {
      this.selectedCategoryId = null;
      this._confirm();
    });
    this.screen.addEventListener("click", (e) => {
      if (e.target === this.screen) this._cancel();
    });
  }

  async show(song?: Song): Promise<void> {
    this.selectedCategoryId = null;
    this.newCategoryInput.value = "";
    this.confirmBtn.disabled = true;

    if (song) {
      this.titleInput.value = song.title;
      this.artistInput.value = song.artist || "";
    } else {
      this.titleInput.value = "";
      this.artistInput.value = "";
    }

    await this._loadCategories();
    this._renderList();
    this.screen.classList.add("active");
    this.titleInput.focus();
  }

  hide(): void {
    this.screen.classList.remove("active");
  }

  private _cancel(): void {
    this.hide();
    if (this.onCancel) this.onCancel();
  }

  private async _loadCategories(): Promise<void> {
    try {
      this.categories = await fetchCategories();
    } catch (err) {
      console.error("Failed to load categories:", err);
      this.categories = [];
    }
  }

  private _renderList(): void {
    this.listEl.innerHTML = "";
    document.getElementById("category-select-count")!.textContent =
      this.categories.length === 0 ? "No categories yet" : `${this.categories.length} categor${this.categories.length === 1 ? "y" : "ies"}`;

    for (const cat of this.categories) {
      const li = document.createElement("li");
      li.className = "category-item";
      if (cat.id === this.selectedCategoryId) li.classList.add("selected");
      li.textContent = cat.name;
      li.addEventListener("click", () => {
        this.selectedCategoryId = cat.id;
        this.listEl.querySelectorAll(".category-item").forEach((el) => { el.classList.remove("selected"); });
        li.classList.add("selected");
        this.confirmBtn.disabled = false;
      });
      this.listEl.appendChild(li);
    }
  }

  private async _createNew(): Promise<void> {
    const name = this.newCategoryInput.value.trim();
    if (!name) return;
    try {
      const created = await createCategory(name);
      if (!this.categories.some((c) => c.id === created.id)) {
        this.categories.push(created);
        this.categories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      }
      this.selectedCategoryId = created.id;
      this.newCategoryInput.value = "";
      this._renderList();
      this.confirmBtn.disabled = false;
    } catch (err) {
      console.error("Failed to create category:", err);
      alert(err instanceof Error ? err.message : "Failed to create category");
    }
  }

  private _confirm(): void {
    this.hide();
    if (this.onConfirm) {
      this.onConfirm(this.selectedCategoryId, this.titleInput.value.trim(), this.artistInput.value.trim());
    }
  }
}