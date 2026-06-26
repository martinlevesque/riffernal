import type { Song } from "../utils/MidiParser.js";
import {
  fetchSongs,
  fetchCategories,
  type CategoryData,
  type SongSummary,
} from "../api/SongApi.js";

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

  get songCount(): number {
    return this.songs.length;
  }

  async refreshFromApi(): Promise<void> {
    try {
      const [summaries, categories] = await Promise.all([
        fetchSongs(),
        fetchCategories(),
      ]);
      this.categories = categories;
      this.songs = summaries.map(this._summaryToSong);
      this._render();
    } catch (err) {
      console.error("Failed to refresh songs from API:", err);
    }
  }

  async loadCategories(): Promise<void> {
    try {
      this.categories = await fetchCategories();
      this._render();
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  }

  async addSong(song: Song): Promise<void> {
    this.songs.push(song);
    try {
      this.categories = await fetchCategories();
    } catch (err) {
      console.error("Failed to refresh categories:", err);
    }
    this._render();
  }

  private _summaryToSong(s: SongSummary): Song {
    return {
      id: s.id,
      title: s.title,
      artist: s.artist || "",
      bpm: s.bpm,
      difficulty: s.difficulty,
      notes: [],
      imported: s.imported,
      categoryId: s.categoryId,
      lastPlayedAt: s.lastPlayedAt,
    };
  }

  private _loadCollapsed(): Set<string> {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      if (!raw) return new Set();
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
    return nonEmpty;
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
    let firstRendered = false;

    for (const group of groups) {
      const section = this._renderGroup(group);
      if (!firstRendered && group.songs.length > 0) {
        firstRendered = true;
      }
      this.songListEl.appendChild(section);
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
      if (isCollapsed) collapsedSet.add(key);
      else collapsedSet.delete(key);
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
    const lastPlayed = this._formatLastPlayed(song.lastPlayedAt);
    el.innerHTML = `
      <div class="song-title">${song.title}</div>
      <div class="song-artist">${song.artist || ""}</div>
      <span class="song-difficulty difficulty-${song.difficulty}">${song.difficulty}</span>
      ${lastPlayed ? `<div class="song-last-played">${lastPlayed}</div>` : ""}
    `;
    el.addEventListener("click", () => {
      this.selectedSong = song;
      this.songListEl.querySelectorAll(".song-item").forEach((s) => {
        s.classList.remove("selected");
      });
      el.classList.add("selected");
      this.startBtn.disabled = false;
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
    if (!ts) return "";

    const date = new Date(`${ts.replace(" ", "T")}Z`);

    if (Number.isNaN(date.getTime())) return "";

    const diffMs = Date.now() - date.getTime();

    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Last played just now";
    if (diffMin < 60) return `Last played ${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `Last played ${diffHr}h ago`;

    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `Last played ${diffDay}d ago`;

    const diffWk = Math.floor(diffDay / 7);
    if (diffWk < 5) return `Last played ${diffWk}w ago`;

    return `Last played ${date.toLocaleDateString()}`;
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
