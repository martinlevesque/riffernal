import { HandSide } from '../../utils/notes.js';
import type { Song } from '../../utils/MidiParser.js';

export interface TrackSelection {
  indices: number[];
  hands: Record<number, HandSide>;
  backgroundTracks: number[];
}

export interface TrackSelectDeps {
  onConfirm: (selection: TrackSelection) => void;
  onCancel: () => void;
}

export class TrackSelect {
  private screen: HTMLElement;
  private titleEl: HTMLElement;
  private hintEl: HTMLElement;
  private listEl: HTMLElement;
  private confirmBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private song: Song | null = null;
  private selected = new Set<number>();
  private hands: Record<number, HandSide> = {};
  private backgroundTracks = new Set<number>();
  private deps: TrackSelectDeps | null = null;

  constructor() {
    this.screen = document.getElementById('track-select-screen')!;
    this.titleEl = document.getElementById('track-select-title')!;
    this.hintEl = document.getElementById('track-select-hint')!;
    this.listEl = document.getElementById('track-list')!;
    this.confirmBtn = document.getElementById('track-select-confirm') as HTMLButtonElement;
    this.cancelBtn = document.getElementById('track-select-cancel') as HTMLButtonElement;

    this.cancelBtn.addEventListener('click', () => this.hide());
    this.confirmBtn.addEventListener('click', () => this._confirm());
    this.screen.addEventListener('click', (e) => {
      if (e.target === this.screen) this.hide();
    });
  }

  show(song: Song, deps: TrackSelectDeps): void {
    this.song = song;
    this.deps = deps;
    this.selected.clear();
    this.hands = { ...(song.trackHands ?? {}) };
    this.backgroundTracks = new Set(song.backgroundTracks ?? []);

    this.titleEl.textContent = song.title;
    this.hintEl.textContent = 'Select 1 or 2 tracks to play';
    this.confirmBtn.disabled = true;
    this._renderList();
    this.screen.classList.add('active');
  }

  hide(): void {
    this.screen.classList.remove('active');
    this.song = null;
    const deps = this.deps;
    this.deps = null;
    deps?.onCancel();
  }

  private _renderList(): void {
    this.listEl.innerHTML = '';
    const tracks = this.song?.tracks ?? [];
    for (const track of tracks) {
      const li = document.createElement('li');
      li.className = 'track-item';

      const selectBtn = document.createElement('button');
      selectBtn.className = 'track-select-btn';
      selectBtn.textContent = track.name;
      selectBtn.addEventListener('click', () => this._toggleSelect(track.index, li));

      const info = document.createElement('span');
      info.className = 'track-info';
      info.textContent = `${track.noteCount} notes`;

      const handBtn = document.createElement('button');
      handBtn.className = 'track-hand-btn';
      handBtn.textContent = this.hands[track.index] === HandSide.Left ? 'LEFT' : 'RIGHT';
      handBtn.disabled = true;
      handBtn.addEventListener('click', () => {
        this.hands[track.index] = this.hands[track.index] === HandSide.Left ? HandSide.Right : HandSide.Left;
        handBtn.textContent = this.hands[track.index] === HandSide.Left ? 'LEFT' : 'RIGHT';
      });

      const bgBtn = document.createElement('button');
      bgBtn.className = 'track-bg-btn';
      bgBtn.title = 'Toggle background playback';
      bgBtn.textContent = this.backgroundTracks.has(track.index) ? '\u{1F50A}' : '\u{1F507}';
      bgBtn.addEventListener('click', () => this._toggleBackground(track.index, bgBtn));

      li.appendChild(selectBtn);
      li.appendChild(info);
      li.appendChild(handBtn);
      li.appendChild(bgBtn);
      this.listEl.appendChild(li);
    }
  }

  private _toggleSelect(index: number, li: HTMLElement): void {
    if (this.selected.has(index)) {
      this.selected.delete(index);
      li.classList.remove('selected');
      this.backgroundTracks.add(index);
    } else {
      if (this.selected.size >= 2) {
        const first = this.selected.values().next().value!;
        this.selected.delete(first);
        this.backgroundTracks.add(first);
        const evictedLi = this.listEl.children[first] as HTMLElement | undefined;
        evictedLi?.classList.remove('selected');
        const evictedHandBtn = evictedLi?.querySelector('.track-hand-btn') as HTMLButtonElement | null;
        if (evictedHandBtn) evictedHandBtn.disabled = true;
        const evictedBgBtn = evictedLi?.querySelector('.track-bg-btn') as HTMLButtonElement | null;
        if (evictedBgBtn) evictedBgBtn.textContent = '\u{1F50A}';
      }
      this.selected.add(index);
      this.backgroundTracks.delete(index);
      li.classList.add('selected');
    }

    const handBtn = li.querySelector('.track-hand-btn') as HTMLButtonElement;
    handBtn.disabled = !this.selected.has(index);

    const bgBtn = li.querySelector('.track-bg-btn') as HTMLButtonElement;
    bgBtn.classList.toggle('disabled', this.selected.has(index));
    bgBtn.textContent = this.backgroundTracks.has(index) ? '\u{1F50A}' : '\u{1F507}';

    this.confirmBtn.disabled = this.selected.size === 0;
    this.hintEl.textContent = this.selected.size === 0
      ? 'Select 1 or 2 tracks to play'
      : this.selected.size === 1
        ? 'Select 1 more track, or CONFIRM to play this track only'
        : '2 tracks selected — CONFIRM to play';
  }

  private _toggleBackground(index: number, btn: HTMLButtonElement): void {
    if (this.selected.has(index)) return;
    if (this.backgroundTracks.has(index)) {
      this.backgroundTracks.delete(index);
      btn.textContent = '\u{1F507}';
    } else {
      this.backgroundTracks.add(index);
      btn.textContent = '\u{1F50A}';
    }
  }

  private _confirm(): void {
    if (!this.song || this.selected.size === 0) return;
    const indices = Array.from(this.selected);
    this.screen.classList.remove('active');
    const deps = this.deps;
    this.deps = null;
    deps?.onConfirm({
      indices,
      hands: { ...this.hands },
      backgroundTracks: Array.from(this.backgroundTracks),
    });
  }
}
