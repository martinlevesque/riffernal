import type { Menu } from './Menu.js';
import type { MidiInput } from '../../input/MidiInput.js';
import type { TrackSelect } from './TrackSelect.js';
import type { CategorySelect } from './CategorySelect.js';
import type { Song } from '../../utils/MidiParser.js';
import { parseMidi } from '../../utils/MidiParser.js';
import { uploadSong, songFullToSong } from '../../api/SongApi.js';
import { reportError } from '../../utils/helpers.js';
import { estimateSongDifficulty } from '../../game/difficulty.js';

export class MidiImportDialog {
  private _importBtn: HTMLButtonElement;
  private _importInput: HTMLInputElement;
  private _menu: Menu;
  private _midiInput: MidiInput;
  private _trackSelect: TrackSelect;
  private _categorySelect: CategorySelect;

  constructor(menu: Menu, midiInput: MidiInput, trackSelect: TrackSelect, categorySelect: CategorySelect) {
    this._menu = menu;
    this._midiInput = midiInput;
    this._trackSelect = trackSelect;
    this._categorySelect = categorySelect;
    this._importBtn = document.getElementById('btn-import-midi')! as HTMLButtonElement;
    this._importInput = document.getElementById('midi-import-input')! as HTMLInputElement;

    this._importBtn.addEventListener('click', () => {
      const input = this._createFileChooser();
      input.click();
    });
  }

  /** Chromium can wedge a reused file input after its chooser is dismissed
   *  (e.g. by clicking outside), making later clicks silently do nothing.
   *  Build a fresh input for each request instead of reusing one. */
  private _createFileChooser(): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'midi-import-input';
    input.accept = '.mid,.midi';
    input.className = 'visually-hidden';
    input.addEventListener('change', () => this._onFileChosen(input));
    this._importInput.replaceWith(input);
    this._importInput = input;
    return input;
  }

  private _onFileChosen(input: HTMLInputElement): void {
    const file = input.files?.[0];

    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const song = parseMidi(reader.result as ArrayBuffer, file.name);
        const needsSelection = song.tracks && song.tracks.length > 2
          && (song.selectedTrackIndices?.length ?? 0) === 0;

        const proceed = (finalSong: Song, midiFile: File) => {
          // TrackSelect may have narrowed the playable set: re-estimate
          // so the picker's prefill reflects the tracks the player will
          // actually play, not every track in the file.
          finalSong.difficulty = estimateSongDifficulty(
            finalSong.notes,
            finalSong.selectedTrackIndices ?? [],
            (finalSong.tracks?.length ?? 0) > 0,
          );

          this._categorySelect.show({
            onConfirm: async (categoryId, title, artist, difficulty) => {
              try {
                const full = await uploadSong({
                  midiFile,
                  metadata: {
                    title: title || finalSong.title,
                    artist: artist || finalSong.artist,
                    bpm: finalSong.bpm,
                    difficulty,
                    notes: finalSong.notes,
                    tracks: finalSong.tracks ?? [],
                    selectedTrackIndices: finalSong.selectedTrackIndices ?? [],
                    trackHands: finalSong.trackHands ?? {},
                    backgroundTracks: finalSong.backgroundTracks ?? [],
                  },
                  categoryId,
                });
                this._menu.addSong(songFullToSong(full));
                this._menu.setMidiStatus(this._midiInput.connected, 'Import complete');
              } catch (err: unknown) {
                reportError('Failed to save song', err, { alert: true });
              }
            },
            onCancel: () => {
              this._menu.setMidiStatus(this._midiInput.connected, 'Import cancelled');
            },
          }, song);
        };

        if (needsSelection) {
          this._trackSelect.show(song, {
            onConfirm: (selection) => {
              song.selectedTrackIndices = selection.indices;
              song.trackHands = selection.hands;
              song.backgroundTracks = selection.backgroundTracks;
              proceed(song, file);
            },
            onCancel: () => {
              this._menu.setMidiStatus(this._midiInput.connected, 'Import cancelled');
            },
          });
        } else {
          proceed(song, file);
        }
      } catch (err: unknown) {
        reportError('Failed to import MIDI', err, { alert: true });
      }

      input.value = '';
    };
    reader.onerror = () => {
      alert('Failed to read file');
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  }
}
