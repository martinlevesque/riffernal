import type { Menu } from './Menu.js';
import type { MidiInput } from '../../input/MidiInput.js';
import type { TrackSelect } from './TrackSelect.js';
import type { CategorySelect } from './CategorySelect.js';
import type { Song } from '../../utils/MidiParser.js';
import { parseMidi } from '../../utils/MidiParser.js';
import { uploadSong, songFullToSong } from '../../api/SongApi.js';
import { reportError } from '../../utils/helpers.js';

export class MidiImportDialog {
  private importBtn: HTMLButtonElement;
  private importInput: HTMLInputElement;
  private menu: Menu;
  private midiInput: MidiInput;
  private trackSelect: TrackSelect;
  private categorySelect: CategorySelect;

  constructor(menu: Menu, midiInput: MidiInput, trackSelect: TrackSelect, categorySelect: CategorySelect) {
    this.menu = menu;
    this.midiInput = midiInput;
    this.trackSelect = trackSelect;
    this.categorySelect = categorySelect;
    this.importBtn = document.getElementById('btn-import-midi')! as HTMLButtonElement;
    this.importInput = document.getElementById('midi-import-input')! as HTMLInputElement;

    this.importBtn.addEventListener('click', () => this.importInput.click());

    this.importInput.addEventListener('change', () => {
      const file = this.importInput.files?.[0];

      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const song = parseMidi(reader.result as ArrayBuffer, file.name);
          const needsSelection = song.tracks && song.tracks.length > 2
            && (song.selectedTrackIndices?.length ?? 0) === 0;

          const proceed = (finalSong: Song, midiFile: File) => {
            this.categorySelect.show({
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
                  this.menu.addSong(songFullToSong(full));
                  this.menu.setMidiStatus(this.midiInput.connected, 'Import complete');
                } catch (err: unknown) {
                  reportError('Failed to save song', err, { alert: true });
                }
              },
              onCancel: () => {
                this.menu.setMidiStatus(this.midiInput.connected, 'Import cancelled');
              },
            }, song);
          };

          if (needsSelection) {
            this.trackSelect.show(song, {
              onConfirm: (selection) => {
                song.selectedTrackIndices = selection.indices;
                song.trackHands = selection.hands;
                song.backgroundTracks = selection.backgroundTracks;
                proceed(song, file);
              },
              onCancel: () => {
                this.menu.setMidiStatus(false, 'Import cancelled');
              },
            });
          } else {
            proceed(song, file);
          }
        } catch (err: unknown) {
          reportError('Failed to import MIDI', err, { alert: true });
        }

        this.importInput.value = '';
      };
      reader.onerror = () => {
        alert('Failed to read file');
        this.importInput.value = '';
      };
      reader.readAsArrayBuffer(file);
    });
  }
}
