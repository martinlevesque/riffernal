import { HandSide } from '../utils/notes.js';
import type { Song } from '../utils/MidiParser.js';

export interface TrackSelection {
  indices: number[];
  hands: Record<number, HandSide>;
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
  onConfirm: ((selection: TrackSelection) => void) | null = null;
  onCancel: (() => void) | null = null;

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

  show(song: Song): void {
    this.song = song;
    this.selected.clear();
    this.hands = { ...(song.trackHands ?? {}) };

    this.titleEl.textContent = song.title;
    this.hintEl.textContent = 'Select 1 or 2 tracks to play';
    this.confirmBtn.disabled = true;
    this._renderList();
    this.screen.classList.add('active');
  }

  hide(): void {
    this.screen.classList.remove('active');
    this.song = null;
    if (this.onCancel) this.onCancel();
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

      li.appendChild(selectBtn);
      li.appendChild(info);
      li.appendChild(handBtn);
      this.listEl.appendChild(li);
    }
  }

  private _toggleSelect(index: number, li: HTMLElement): void {
    if (this.selected.has(index)) {
      this.selected.delete(index);
      li.classList.remove('selected');
    } else {
      if (this.selected.size >= 2) {
        const first = this.selected.values().next().value!;
        this.selected.delete(first);
        this.listEl.children[first]?.classList.remove('selected');
      }
      this.selected.add(index);
      li.classList.add('selected');
    }

    const handBtn = li.querySelector('.track-hand-btn') as HTMLButtonElement;
    handBtn.disabled = !this.selected.has(index);

    this.confirmBtn.disabled = this.selected.size === 0;
    this.hintEl.textContent = this.selected.size === 0
      ? 'Select 1 or 2 tracks to play'
      : this.selected.size === 1
        ? 'Select 1 more track, or CONFIRM to play this track only'
        : '2 tracks selected — CONFIRM to play';
  }

  private _confirm(): void {
    if (!this.song || this.selected.size === 0) return;
    const indices = Array.from(this.selected);
    this.screen.classList.remove('active');
    if (this.onConfirm) {
      this.onConfirm({ indices, hands: { ...this.hands } });
    }
  }
}
