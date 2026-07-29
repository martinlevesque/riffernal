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
  private songs: Song[] = [];
  private categories: CategoryData[] = [];
  private selectedSong: Song | null = null;
  onStart: ((song: Song) => void) | null = null;
  onRename: ((song: Song) => void) | null = null;
  private songListEl: HTMLElement;
  private startBtn: HTMLButtonElement;
  private menuScreen: HTMLElement;
  private midiStatusEl: HTMLElement;

  constructor(songs: Song[]) {
    this.songs = songs;
    this.songListEl = document.getElementById("song-list")!;
    this.startBtn = document.getElementById("btn-start") as HTMLButtonElement;
    this.menuScreen = document.getElementById("menu-screen")!;
    this.midiStatusEl = document.getElementById("midi-status")!;
    this._render();
    this.startBtn.addEventListener("click", () => {
      if (this.selectedSong && this.onStart) {
        this.onStart(this.selectedSong);
      }
    });
  }

  async loadCategories(): Promise<void> {
    try {
      this.categories = await fetchCategories();
      this._render();
    } catch (err) {
      reportError("Failed to load categories", err);
    }
  }

  async addSong(song: Song): Promise<void> {
    this.songs.push(song);
    try {
      this.categories = await fetchCategories();
    } catch (err) {
      reportError("Failed to refresh categories", err);
    }
    this._render();
  }

  updateSong(updated: Song): void {
    const idx = this.songs.findIndex((s) => s.id === updated.id);
    if (idx !== -1) {
      this.songs[idx] = { ...this.songs[idx], title: updated.title, artist: updated.artist };
    }
    this._render();
  }

  updateSongStats(id: number, bestScore: number | null, lastScore?: number): void {
    const song = this.songs.find((s) => s.id === id);

    if (song) {
      song.bestScore = bestScore;
      if (lastScore !== undefined) {
        song.lastScore = lastScore;
      }
      this._render();
    }
  }

  refreshSongs(songs: Song[]): void {
    this.songs = songs;
    this._render();
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

    for (const cat of this.categories) {
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

    for (const song of this.songs) {
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
    this.songListEl.innerHTML = "";

    if (this.songs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-song-list";
      empty.textContent = "No songs yet. Import a MIDI to get started.";
      this.songListEl.appendChild(empty);
      this.startBtn.disabled = true;
      this.selectedSong = null;
      return;
    }

    const groups = this._groupSongs();

    for (const group of groups) {
      this.songListEl.appendChild(this._renderGroup(group));
    }

    if (this.selectedSong && !this.songs.includes(this.selectedSong)) {
      this.selectedSong = null;
      this.startBtn.disabled = true;
    }
    if (!this.selectedSong) {
      const first = this.songs[0];
      if (first) this._autoSelect(first);
      else this.startBtn.disabled = true;
    } else {
      this._reapplySelection();
      this.startBtn.disabled = false;
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
    const el = document.createElement("div");
    el.className = `song-item${song.imported ? " imported" : ""}`;
    el.dataset.songId = song.id !== undefined ? String(song.id) : "";

    const title = document.createElement("div");
    title.className = "song-title";
    title.textContent = song.title;

    const artist = document.createElement("div");
    artist.className = "song-artist";
    artist.textContent = song.artist || "";

    const difficulty = document.createElement("span");
    difficulty.className = `song-difficulty difficulty-${song.difficulty}`;
    difficulty.textContent = song.difficulty;

    el.appendChild(title);
    el.appendChild(artist);
    el.appendChild(difficulty);

    const lastPlayed = this._formatLastPlayed(song.lastPlayedAt);

    if (lastPlayed) {
      const lastPlayedEl = document.createElement("div");
      lastPlayedEl.className = "song-last-played";
      lastPlayedEl.textContent = lastPlayed;
      el.appendChild(lastPlayedEl);
    }

    if (song.bestScore != null || song.lastScore != null) {
      const scoreEl = document.createElement("div");
      scoreEl.className = "song-scores";
      const parts: string[] = [];

      if (song.lastScore != null) {
        parts.push(`Last: ${formatScore(song.lastScore)}`);
      }

      if (song.bestScore != null) {
        parts.push(`Best: ${formatScore(song.bestScore)}`);
      }

      scoreEl.textContent = parts.join(" | ");
      el.appendChild(scoreEl);
    }

    const editBtn = document.createElement("button");
    editBtn.className = "song-edit-btn";
    editBtn.textContent = "\u270E";
    editBtn.title = "Rename song";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.onRename) this.onRename(song);
    });
    editBtn.addEventListener("dblclick", (e) => {
      e.stopPropagation();
    });
    el.appendChild(editBtn);

    el.addEventListener("click", () => {
      this.selectedSong = song;
      this.songListEl.querySelectorAll(".song-item").forEach((s) => {
        s.classList.remove("selected");
      });
      el.classList.add("selected");
      this.startBtn.disabled = false;
    });

    el.addEventListener("dblclick", () => {
      if (this.onStart) {
        this.onStart(song);
      }
    });

    return el;
  }

  private _autoSelect(song: Song): void {
    this.selectedSong = song;
    const firstItem = this.songListEl.querySelector(
      ".song-item",
    ) as HTMLElement | null;
    firstItem?.classList.add("selected");
    this.startBtn.disabled = false;
  }

  private _reapplySelection(): void {
    const items = this.songListEl.querySelectorAll(".song-item");

    for (const item of items) {
      const el = item as HTMLElement;

      if (el.dataset.songId === String(this.selectedSong?.id ?? "")) {
        el.classList.add("selected");
        return;
      }
    }
  }

  private _formatLastPlayed(ts: string | null | undefined): string {
    return formatRelativeTime(ts, "Last played ");
  }

  show(): void {
    this.menuScreen.classList.add("active");
  }

  hide(): void {
    this.menuScreen.classList.remove("active");
  }

  setMidiStatus(connected: boolean, message: string): void {
    this.midiStatusEl.textContent = message;
    this.midiStatusEl.className = `midi-status${connected ? " connected" : ""}`;
  }
}
