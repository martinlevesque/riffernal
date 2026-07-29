import type { Game } from '../../game/Game.js';
import type { Song } from '../../utils/MidiParser.js';
import { saveSongTrackPreferences } from '../../api/SongApi.js';

export class BackgroundPanel {
  private toggleBgBtn: HTMLButtonElement;
  private bgPanel: HTMLElement;
  private bgTrackList: HTMLElement;
  private bgPanelOpen = false;
  private preferencesTimer: ReturnType<typeof setTimeout> | null = null;
  private game: Game;

  constructor(game: Game) {
    this.game = game;
    this.toggleBgBtn = document.getElementById('btn-toggle-bg')! as HTMLButtonElement;
    this.bgPanel = document.getElementById('bg-panel')!;
    this.bgTrackList = document.getElementById('bg-track-list')!;

    this.game.onTrackPreferencesChange = (song) => this.schedulePreferencesSave(song);

    this.toggleBgBtn.addEventListener('click', () => {
      this.bgPanelOpen = !this.bgPanelOpen;

      if (this.bgPanelOpen) {
        this.render();
        this.bgPanel.classList.remove('hidden');
      } else {
        this.bgPanel.classList.add('hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (this.bgPanelOpen && !this.bgPanel.contains(e.target as Node) && e.target !== this.toggleBgBtn) {
        this.bgPanelOpen = false;
        this.bgPanel.classList.add('hidden');
      }
    });
  }

  render(): void {
    this.bgTrackList.innerHTML = '';
    const song = this.game.song;

    if (!song) {
      this.bgPanel.classList.add('hidden');

      return;
    }

    const mainLi = document.createElement('li');
    mainLi.className = 'bg-track-item';
    const mainLabel = document.createElement('span');
    mainLabel.className = 'bg-track-label';
    mainLabel.textContent = `${this.mainTrackName(song)} (main)`;
    const mainToggle = document.createElement('button');
    mainToggle.className = 'bg-track-toggle';
    const mainOn = !this.game.mainTrackMuted;
    mainToggle.textContent = mainOn ? '\u{1F50A}' : '\u{1F507}';
    mainToggle.title = mainOn ? 'Mute main track' : 'Unmute main track';
    mainToggle.addEventListener('click', () => {
      const nowMuted = !this.game.mainTrackMuted;
      this.game.setMainTrackMuted(nowMuted);
      const on = !nowMuted;
      mainToggle.textContent = on ? '\u{1F50A}' : '\u{1F507}';
      mainToggle.title = on ? 'Mute main track' : 'Unmute main track';
    });
    mainLi.appendChild(mainLabel);
    mainLi.appendChild(mainToggle);
    this.bgTrackList.appendChild(mainLi);

    if (!song.tracks || song.tracks.length === 0) {
      this.bgPanel.classList.remove('hidden');

      return;
    }

    const selectedSet = new Set(song.selectedTrackIndices ?? []);
    const bgTracks = song.tracks.filter((t) => !selectedSet.has(t.index));

    if (bgTracks.length === 0) {
      this.bgPanel.classList.remove('hidden');

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
      const isOn = this.game.noteManager.backgroundTracks.has(track.index);
      toggle.textContent = isOn ? '\u{1F50A}' : '\u{1F507}';
      toggle.title = isOn ? 'Mute background' : 'Unmute background';
      toggle.addEventListener('click', () => {
        const nowOn = !this.game.noteManager.backgroundTracks.has(track.index);
        this.game.setBackgroundTrack(track.index, nowOn);
        toggle.textContent = nowOn ? '\u{1F50A}' : '\u{1F507}';
        toggle.title = nowOn ? 'Mute background' : 'Unmute background';
      });

      li.appendChild(label);
      li.appendChild(toggle);
      this.bgTrackList.appendChild(li);
    }

    this.bgPanel.classList.remove('hidden');
  }

  private mainTrackName(song: Song): string {
    const tracks = song.tracks ?? [];
    const firstSelected = song.selectedTrackIndices?.[0];
    const picked = firstSelected !== undefined
      ? tracks.find((t) => t.index === firstSelected)
      : undefined;

    return picked?.name ?? tracks[0]?.name ?? 'Main (piano)';
  }

  private schedulePreferencesSave(song: Song): void {
    const songId = song.id;

    if (songId === undefined) return;

    if (this.preferencesTimer !== null) clearTimeout(this.preferencesTimer);
    this.preferencesTimer = setTimeout(() => {
      this.preferencesTimer = null;
      const preferences = song.trackPreferences;

      if (!preferences) return;
      saveSongTrackPreferences(songId, preferences)
        .catch((e) => console.warn('Failed to save track preferences:', e));
    }, 500);
  }
}
