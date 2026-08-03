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
  private _screen: HTMLElement;
  private _titleEl: HTMLElement;
  private _hintEl: HTMLElement;
  private _listEl: HTMLElement;
  private _confirmBtn: HTMLButtonElement;
  private _cancelBtn: HTMLButtonElement;
  private _song: Song | null = null;
  private _selected = new Set<number>();
  private _hands: Record<number, HandSide> = {};
  private _backgroundTracks = new Set<number>();
  private _deps: TrackSelectDeps | null = null;

  constructor() {
    this._screen = document.getElementById('track-select-screen')!;
    this._titleEl = document.getElementById('track-select-title')!;
    this._hintEl = document.getElementById('track-select-hint')!;
    this._listEl = document.getElementById('track-list')!;
    this._confirmBtn = document.getElementById('track-select-confirm') as HTMLButtonElement;
    this._cancelBtn = document.getElementById('track-select-cancel') as HTMLButtonElement;

    this._cancelBtn.addEventListener('click', () => this.hide());
    this._confirmBtn.addEventListener('click', () => this._confirm());
    this._screen.addEventListener('click', (e) => {
      if (e.target === this._screen) this.hide();
    });
  }

  show(song: Song, deps: TrackSelectDeps): void {
    this._song = song;
    this._deps = deps;
    this._selected.clear();
    this._hands = { ...(song.trackHands ?? {}) };
    this._backgroundTracks = new Set(song.backgroundTracks ?? []);

    this._titleEl.textContent = song.title;
    this._hintEl.textContent = 'Select 1 or 2 tracks to play';
    this._confirmBtn.disabled = true;
    this._renderList();
    this._screen.classList.add('active');
  }

  hide(): void {
    this._screen.classList.remove('active');
    this._song = null;
    const deps = this._deps;
    this._deps = null;
    deps?.onCancel();
  }

  private _renderList(): void {
    this._listEl.innerHTML = '';
    const tracks = this._song?.tracks ?? [];
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
      handBtn.textContent = this._hands[track.index] === HandSide.Left ? 'LEFT' : 'RIGHT';
      handBtn.disabled = true;
      handBtn.addEventListener('click', () => {
        this._hands[track.index] = this._hands[track.index] === HandSide.Left ? HandSide.Right : HandSide.Left;
        handBtn.textContent = this._hands[track.index] === HandSide.Left ? 'LEFT' : 'RIGHT';
      });

      const bgBtn = document.createElement('button');
      bgBtn.className = 'track-bg-btn';
      bgBtn.title = 'Toggle background playback';
      bgBtn.textContent = this._backgroundTracks.has(track.index) ? '\u{1F50A}' : '\u{1F507}';
      bgBtn.addEventListener('click', () => this._toggleBackground(track.index, bgBtn));

      li.appendChild(selectBtn);
      li.appendChild(info);
      li.appendChild(handBtn);
      li.appendChild(bgBtn);
      this._listEl.appendChild(li);
    }
  }

  private _toggleSelect(index: number, li: HTMLElement): void {
    if (this._selected.has(index)) {
      this._selected.delete(index);
      li.classList.remove('selected');
      this._backgroundTracks.add(index);
    } else {
      if (this._selected.size >= 2) {
        const first = this._selected.values().next().value!;
        this._selected.delete(first);
        this._backgroundTracks.add(first);
        const evictedLi = this._listEl.children[first] as HTMLElement | undefined;
        evictedLi?.classList.remove('selected');
        const evictedHandBtn = evictedLi?.querySelector('.track-hand-btn') as HTMLButtonElement | null;
        if (evictedHandBtn) evictedHandBtn.disabled = true;
        const evictedBgBtn = evictedLi?.querySelector('.track-bg-btn') as HTMLButtonElement | null;
        if (evictedBgBtn) evictedBgBtn.textContent = '\u{1F50A}';
      }
      this._selected.add(index);
      this._backgroundTracks.delete(index);
      li.classList.add('selected');
    }

    const handBtn = li.querySelector('.track-hand-btn') as HTMLButtonElement;
    handBtn.disabled = !this._selected.has(index);

    const bgBtn = li.querySelector('.track-bg-btn') as HTMLButtonElement;
    bgBtn.classList.toggle('disabled', this._selected.has(index));
    bgBtn.textContent = this._backgroundTracks.has(index) ? '\u{1F50A}' : '\u{1F507}';

    this._confirmBtn.disabled = this._selected.size === 0;
    this._hintEl.textContent = this._selected.size === 0
      ? 'Select 1 or 2 tracks to play'
      : this._selected.size === 1
        ? 'Select 1 more track, or CONFIRM to play this track only'
        : '2 tracks selected — CONFIRM to play';
  }

  private _toggleBackground(index: number, btn: HTMLButtonElement): void {
    if (this._selected.has(index)) return;
    if (this._backgroundTracks.has(index)) {
      this._backgroundTracks.delete(index);
      btn.textContent = '\u{1F507}';
    } else {
      this._backgroundTracks.add(index);
      btn.textContent = '\u{1F50A}';
    }
  }

  private _confirm(): void {
    if (!this._song || this._selected.size === 0) return;
    const indices = Array.from(this._selected);
    this._screen.classList.remove('active');
    const deps = this._deps;
    this._deps = null;
    deps?.onConfirm({
      indices,
      hands: { ...this._hands },
      backgroundTracks: Array.from(this._backgroundTracks),
    });
  }
}
