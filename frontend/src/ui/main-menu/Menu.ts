import type { Song } from "../../utils/MidiParser.js";
import { formatScore, formatRelativeTime, parseSqlTimestamp, reportError } from "../../utils/helpers.js";
import {
  fetchCategories,
  type CategoryData,
} from "../../api/SongApi.js";

interface CategoryGroup {
  id: number | null;
  name: string;
  songs: Song[];
  collapsed: boolean;
}

const UNCATEGORIZED_ID: number | null = null;
const COLLAPSED_KEY = "ironkeys:collapsed-categories";

export class Menu {
  private _songs: Song[] = [];
  private _categories: CategoryData[] = [];
  private _selectedSong: Song | null = null;
  onStart: ((song: Song) => void) | null = null;
  onRename: ((song: Song) => void) | null = null;
  onDelete: ((song: Song) => void) | null = null;
  private _songListEl: HTMLElement;
  private _startBtn: HTMLButtonElement;
  private _menuScreen: HTMLElement;
  private _midiStatusEl: HTMLElement;

  constructor(songs: Song[]) {
    this._songs = songs;
    this._songListEl = document.getElementById("song-list")!;
    this._startBtn = document.getElementById("btn-start") as HTMLButtonElement;
    this._menuScreen = document.getElementById("menu-screen")!;
    this._midiStatusEl = document.getElementById("midi-status")!;
    this._render();
    this._startBtn.addEventListener("click", () => {
      if (this._selectedSong && this.onStart) {
        this.onStart(this._selectedSong);
      }
    });

    document.addEventListener("click", () => {
      this._closeAllActionMenus();
    });
  }

  async loadCategories(): Promise<void> {
    try {
      this._categories = await fetchCategories();
      this._render();
    } catch (err) {
      reportError("Failed to load categories", err);
    }
  }

  async addSong(song: Song): Promise<void> {
    this._songs.push(song);
    try {
      this._categories = await fetchCategories();
    } catch (err) {
      reportError("Failed to refresh categories", err);
    }
    this._render();
  }

  updateSong(updated: Song): void {
    const idx = this._songs.findIndex((s) => s.id === updated.id);
    if (idx !== -1) {
      this._songs[idx] = { ...this._songs[idx], title: updated.title, artist: updated.artist };
    }
    this._render();
  }

  removeSong(id: number): void {
    this._songs = this._songs.filter((s) => s.id !== id);
    if (this._selectedSong?.id === id) {
      this._selectedSong = null;
      this._startBtn.disabled = true;
    }
    this._render();
  }

  updateSongStats(id: number, bestScore: number | null, lastScore?: number): void {
    const song = this._songs.find((s) => s.id === id);

    if (song) {
      song.bestScore = bestScore;
      if (lastScore !== undefined) {
        song.lastScore = lastScore;
      }
      this._render();
    }
  }

  refreshSongs(songs: Song[]): void {
    this._songs = songs;
    this._render();
  }

  private _closeAllActionMenus(): void {
    const menus = this._songListEl.querySelectorAll(".song-actions-menu:not(.hidden)");
    for (const menu of menus) {
      menu.classList.add("hidden");
    }
  }

  private _loadCollapsed(): Set<string> {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);

      if (!raw) {
        return new Set();
      }

      return new Set(JSON.parse(raw) as string[]);
    } catch (err) {
      console.warn("Failed to load collapsed state:", err);
      return new Set();
    }
  }

  private _saveCollapsed(set: Set<string>): void {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(set)));
    } catch (err) {
      console.warn("Failed to save collapsed state:", err);
    }
  }

  private _groupSongs(): CategoryGroup[] {
    const collapsed = this._loadCollapsed();
    const groups: CategoryGroup[] = [];
    const indexByKey = new Map<string, number>();

    for (const cat of this._categories) {
      const key = `cat:${cat.id}`;
      indexByKey.set(key, groups.length);
      groups.push({
        id: cat.id,
        name: cat.name,
        songs: [],
        collapsed: collapsed.has(key),
      });
    }

    const uncKey = "uncategorized";
    indexByKey.set(uncKey, groups.length);
    groups.push({
      id: UNCATEGORIZED_ID,
      name: "Uncategorized",
      songs: [],
      collapsed: collapsed.has(uncKey),
    });

    for (const song of this._songs) {
      const catId = song.categoryId ?? null;
      let group = groups.find((g) => g.id === catId);

      if (!group) {
        // Category was deleted; treat as uncategorized
        group = groups.find((g) => g.id === UNCATEGORIZED_ID)!;
      }

      group.songs.push(song);
    }

    const nonEmpty = groups.filter((g) => g.songs.length > 0);
    nonEmpty.sort((a, b) => {
      const aLast = this._latestPlay(a.songs);
      const bLast = this._latestPlay(b.songs);

      if (aLast !== bLast) {
        return bLast - aLast;
      }

      if (a.id === null) {
        return 1;
      }

      if (b.id === null) {
        return -1;
      }

      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return nonEmpty;
  }

  private _latestPlay(songs: Song[]): number {
    let latest = 0;
    for (const s of songs) {
      if (s.lastPlayedAt) {
        const ts = parseSqlTimestamp(s.lastPlayedAt).getTime();

        if (ts > latest) {
          latest = ts;
        }
      }
    }
    return latest;
  }

  private _render(): void {
    this._songListEl.innerHTML = "";

    if (this._songs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-song-list";
      empty.textContent = "No songs yet. Import a MIDI to get started.";
      this._songListEl.appendChild(empty);
      this._startBtn.disabled = true;
      this._selectedSong = null;
      return;
    }

    const groups = this._groupSongs();

    for (const group of groups) {
      this._songListEl.appendChild(this._renderGroup(group));
    }

    if (this._selectedSong && !this._songs.includes(this._selectedSong)) {
      this._selectedSong = null;
      this._startBtn.disabled = true;
    }
    if (!this._selectedSong) {
      const first = this._songs[0];
      if (first) this._autoSelect(first);
      else this._startBtn.disabled = true;
    } else {
      this._reapplySelection();
      this._startBtn.disabled = false;
    }
  }

  private _renderGroup(group: CategoryGroup): HTMLElement {
    const section = document.createElement("div");
    section.className = `category-section${group.collapsed ? " collapsed" : ""}`;
    section.dataset.categoryKey =
      group.id === null ? "uncategorized" : `cat:${group.id}`;

    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `<span>${group.name}</span><span><span class="category-count">${group.songs.length}</span><span class="category-collapse-icon"></span></span>`;
    header.addEventListener("click", () => {
      const collapsedSet = this._loadCollapsed();
      const key = group.id === null ? "uncategorized" : `cat:${group.id}`;
      const isCollapsed = section.classList.toggle("collapsed");

      if (isCollapsed) {
        collapsedSet.add(key);
      } else {
        collapsedSet.delete(key);
      }
      this._saveCollapsed(collapsedSet);
    });

    const songsWrap = document.createElement("div");
    songsWrap.className = "category-songs";
    for (const song of group.songs) {
      songsWrap.appendChild(this._renderSong(song));
    }

    section.appendChild(header);
    section.appendChild(songsWrap);
    return section;
  }

  private _renderSong(song: Song): HTMLElement {
    const el = this._el("div", `song-item${song.imported ? " imported" : ""}`);
    el.dataset.songId = song.id !== undefined ? String(song.id) : "";

    this._renderSongMeta(song, el);
    this._renderSongStats(song, el);
    this._renderSongActions(song, el);

    el.addEventListener("click", () => {
      this._selectedSong = song;
      this._songListEl.querySelectorAll(".song-item").forEach((s) => { s.classList.remove("selected"); });
      el.classList.add("selected");
      this._startBtn.disabled = false;
    });

    el.addEventListener("dblclick", () => {
      if (this.onStart) this.onStart(song);
    });

    return el;
  }

  private _el(tag: string, className: string, text?: string): HTMLElement {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  private _actionOption(text: string, className: string, onClick: () => void): HTMLButtonElement {
    const btn = this._el("button", className, text) as HTMLButtonElement;
    btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    btn.addEventListener("dblclick", (e) => { e.stopPropagation(); });
    return btn;
  }

  private _renderSongMeta(song: Song, el: HTMLElement): void {
    el.appendChild(this._el("div", "song-title", song.title));
    el.appendChild(this._el("div", "song-artist", song.artist || ""));
    el.appendChild(this._el("span", `song-difficulty difficulty-${song.difficulty}`, song.difficulty));
  }

  private _renderSongStats(song: Song, el: HTMLElement): void {
    const lastPlayed = this._formatLastPlayed(song.lastPlayedAt);

    if (lastPlayed) {
      el.appendChild(this._el("div", "song-last-played", lastPlayed));
    }

    if (song.bestScore != null || song.lastScore != null) {
      const parts: string[] = [];

      if (song.lastScore != null) {
        parts.push(`Last: ${formatScore(song.lastScore)}`);
      }

      if (song.bestScore != null) {
        parts.push(`Best: ${formatScore(song.bestScore)}`);
      }

      el.appendChild(this._el("div", "song-scores", parts.join(" | ")));
    }
  }

  private _renderSongActions(song: Song, el: HTMLElement): void {
    const actionsMenu = this._el("div", "song-actions-menu hidden");

    const actionsBtn = this._el("button", "song-actions-btn", "\u2026") as HTMLButtonElement;
    actionsBtn.title = "Song actions";
    actionsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const wasHidden = actionsMenu.classList.contains("hidden");
      this._closeAllActionMenus();
      if (wasHidden) {
        actionsMenu.classList.remove("hidden");
      }
    });
    actionsBtn.addEventListener("dblclick", (e) => { e.stopPropagation(); });

    actionsMenu.appendChild(this._actionOption("Edit", "song-action-option", () => {
      actionsMenu.classList.add("hidden");
      if (this.onRename) this.onRename(song);
    }));

    if (song.importedByUserId != null) {
      actionsMenu.appendChild(this._actionOption("Delete", "song-action-option danger", () => {
        actionsMenu.classList.add("hidden");
        if (this.onDelete) this.onDelete(song);
      }));
    }

    el.appendChild(actionsBtn);
    el.appendChild(actionsMenu);
  }

  private _autoSelect(song: Song): void {
    this._selectedSong = song;
    const firstItem = this._songListEl.querySelector(
      ".song-item",
    ) as HTMLElement | null;
    firstItem?.classList.add("selected");
    this._startBtn.disabled = false;
  }

  private _reapplySelection(): void {
    const items = this._songListEl.querySelectorAll(".song-item");

    for (const item of items) {
      const el = item as HTMLElement;

      if (el.dataset.songId === String(this._selectedSong?.id ?? "")) {
        el.classList.add("selected");
        return;
      }
    }
  }

  private _formatLastPlayed(ts: string | null | undefined): string {
    return formatRelativeTime(ts, "Last played ");
  }

  show(): void {
    this._menuScreen.classList.add("active");
  }

  hide(): void {
    this._menuScreen.classList.remove("active");
  }

  setMidiStatus(connected: boolean, message: string): void {
    this._midiStatusEl.textContent = message;
    this._midiStatusEl.className = `midi-status${connected ? " connected" : ""}`;
  }
}
