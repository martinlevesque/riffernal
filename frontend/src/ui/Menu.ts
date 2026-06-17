import type { Song } from '../types.js';

export class Menu {
  private songs: Song[];
  private selectedSong: Song | null = null;
  onStart: ((song: Song) => void) | null = null;
  private songListEl: HTMLElement;
  private startBtn: HTMLButtonElement;
  private menuScreen: HTMLElement;
  private midiStatusEl: HTMLElement;

  constructor(songs: Song[]) {
    this.songs = songs;
    this.songListEl = document.getElementById('song-list')!;
    this.startBtn = document.getElementById('btn-start') as HTMLButtonElement;
    this.menuScreen = document.getElementById('menu-screen')!;
    this.midiStatusEl = document.getElementById('midi-status')!;
    this._render();
    this.startBtn.addEventListener('click', () => {
      if (this.selectedSong && this.onStart) {
        this.onStart(this.selectedSong);
      }
    });
  }

  private _render(): void {
    this.songListEl.innerHTML = '';
    for (const song of this.songs) {
      const el = document.createElement('div');
      el.className = 'song-item' + (song.imported ? ' imported' : '');
      el.innerHTML = `
        <div class="song-title">${song.title}</div>
        <div class="song-artist">${song.artist}</div>
        <span class="song-difficulty difficulty-${song.difficulty}">${song.difficulty}</span>
      `;
      el.addEventListener('click', () => {
        this.selectedSong = song;
        this.songListEl.querySelectorAll('.song-item').forEach(s => s.classList.remove('selected'));
        el.classList.add('selected');
        this.startBtn.disabled = false;
      });
      this.songListEl.appendChild(el);
    }
    if (this.songs.length > 0) {
      this.selectedSong = this.songs[0];
      (this.songListEl.children[0] as HTMLElement).classList.add('selected');
    }
  }

  show(): void {
    this.menuScreen.classList.add('active');
  }

  hide(): void {
    this.menuScreen.classList.remove('active');
  }

  addSong(song: Song): void {
    this.songs.push(song);
    this._render();
  }

  setMidiStatus(connected: boolean, message: string): void {
    this.midiStatusEl.textContent = message;
    this.midiStatusEl.className = 'midi-status' + (connected ? ' connected' : '');
  }
}
