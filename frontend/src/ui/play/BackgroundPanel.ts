import type { Game } from '../../game/Game.js';
import type { Song } from '../../utils/MidiParser.js';
import { saveSongTrackPreferences } from '../../api/SongApi.js';
import { isGuestMode } from '../../api/AuthApi.js';

export class BackgroundPanel {
  private _toggleBgBtn: HTMLButtonElement;
  private _bgPanel: HTMLElement;
  private _bgTrackList: HTMLElement;
  private _bgPanelOpen = false;
  private _preferencesTimer: ReturnType<typeof setTimeout> | null = null;
  private _game: Game;

  constructor(game: Game) {
    this._game = game;
    this._toggleBgBtn = document.getElementById('btn-toggle-bg')! as HTMLButtonElement;
    this._bgPanel = document.getElementById('bg-panel')!;
    this._bgTrackList = document.getElementById('bg-track-list')!;

    this._game.onTrackPreferencesChange = (song) => this._schedulePreferencesSave(song);

    this._toggleBgBtn.addEventListener('click', () => {
      this._bgPanelOpen = !this._bgPanelOpen;

      if (this._bgPanelOpen) {
        this.render();
        this._bgPanel.classList.remove('hidden');
      } else {
        this._bgPanel.classList.add('hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (this._bgPanelOpen && !this._bgPanel.contains(e.target as Node) && e.target !== this._toggleBgBtn) {
        this._bgPanelOpen = false;
        this._bgPanel.classList.add('hidden');
      }
    });
  }

  render(): void {
    this._bgTrackList.innerHTML = '';
    const song = this._game.song;

    if (!song) {
      this._bgPanel.classList.add('hidden');

      return;
    }

    const mainLi = document.createElement('li');
    mainLi.className = 'bg-track-item';
    const mainLabel = document.createElement('span');
    mainLabel.className = 'bg-track-label';
    mainLabel.textContent = `${this._mainTrackName(song)} (main)`;
    const mainToggle = document.createElement('button');
    mainToggle.className = 'bg-track-toggle';
    const mainOn = !this._game.mainTrackMuted;
    mainToggle.textContent = mainOn ? '\u{1F50A}' : '\u{1F507}';
    mainToggle.title = mainOn ? 'Mute main track' : 'Unmute main track';
    mainToggle.addEventListener('click', () => {
      const nowMuted = !this._game.mainTrackMuted;
      this._game.setMainTrackMuted(nowMuted);
      const on = !nowMuted;
      mainToggle.textContent = on ? '\u{1F50A}' : '\u{1F507}';
      mainToggle.title = on ? 'Mute main track' : 'Unmute main track';
    });
    mainLi.appendChild(mainLabel);
    mainLi.appendChild(mainToggle);
    this._bgTrackList.appendChild(mainLi);

    if (!song.tracks || song.tracks.length === 0) {
      this._bgPanel.classList.remove('hidden');

      return;
    }

    const selectedSet = new Set(song.selectedTrackIndices ?? []);
    const bgTracks = song.tracks.filter((t) => !selectedSet.has(t.index));

    if (bgTracks.length === 0) {
      this._bgPanel.classList.remove('hidden');

      return;
    }

    for (const track of bgTracks) {
      const li = document.createElement('li');
      li.className = 'bg-track-item';

      const label = document.createElement('span');
      label.className = 'bg-track-label';
      label.textContent = track.name;

      const toggle = document.createElement('button');
      toggle.className = 'bg-track-toggle';
      const isOn = this._game.noteManager.backgroundTracks.has(track.index);
      toggle.textContent = isOn ? '\u{1F50A}' : '\u{1F507}';
      toggle.title = isOn ? 'Mute background' : 'Unmute background';
      toggle.addEventListener('click', () => {
        const nowOn = !this._game.noteManager.backgroundTracks.has(track.index);
        this._game.setBackgroundTrack(track.index, nowOn);
        toggle.textContent = nowOn ? '\u{1F50A}' : '\u{1F507}';
        toggle.title = nowOn ? 'Mute background' : 'Unmute background';
      });

      li.appendChild(label);
      li.appendChild(toggle);
      this._bgTrackList.appendChild(li);
    }

    this._bgPanel.classList.remove('hidden');
  }

  private _mainTrackName(song: Song): string {
    const tracks = song.tracks ?? [];
    const firstSelected = song.selectedTrackIndices?.[0];
    const picked = firstSelected !== undefined
      ? tracks.find((t) => t.index === firstSelected)
      : undefined;

    return picked?.name ?? tracks[0]?.name ?? 'Main (piano)';
  }

  private _schedulePreferencesSave(song: Song): void {
    const songId = song.id;

    // Guests have no server-side preferences to save.
    if (songId === undefined || isGuestMode()) return;

    if (this._preferencesTimer !== null) clearTimeout(this._preferencesTimer);
    this._preferencesTimer = setTimeout(() => {
      this._preferencesTimer = null;
      const preferences = song.trackPreferences;

      if (!preferences) return;
      saveSongTrackPreferences(songId, preferences)
        .catch((e) => console.warn('Failed to save track preferences:', e));
    }, 500);
  }
}
