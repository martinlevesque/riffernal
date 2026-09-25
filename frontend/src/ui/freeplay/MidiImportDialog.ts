import type { Menu } from './Menu.js';
import type { MidiInput } from '../../input/MidiInput.js';
import type { TrackSelect } from './TrackSelect.js';
import type { CategorySelect } from './CategorySelect.js';
import type { Song } from '../../utils/MidiParser.js';
import { parseMidi } from '../../utils/MidiParser.js';
import { uploadSong, songFullToSong } from '../../api/SongApi.js';
import { reportError } from '../../utils/helpers.js';

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

    this._importBtn.addEventListener('click', () => this._importInput.click());

    this._importInput.addEventListener('change', () => {
      const file = this._importInput.files?.[0];

      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const song = parseMidi(reader.result as ArrayBuffer, file.name);
          const needsSelection = song.tracks && song.tracks.length > 2
            && (song.selectedTrackIndices?.length ?? 0) === 0;

          const proceed = (finalSong: Song, midiFile: File) => {
            this._categorySelect.show({
              onConfirm: async (categoryId, title, artist) => {
                try {
                  const full = await uploadSong({
                    midiFile,
                    metadata: {
                      title: title || finalSong.title,
                      artist: artist || finalSong.artist,
                      bpm: finalSong.bpm,
                      difficulty: finalSong.difficulty,
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

        this._importInput.value = '';
      };
      reader.onerror = () => {
        alert('Failed to read file');
        this._importInput.value = '';
      };
      reader.readAsArrayBuffer(file);
    });
  }
}
