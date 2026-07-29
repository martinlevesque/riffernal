import type { Menu } from './Menu.js';
import type { MidiInput } from '../../input/MidiInput.js';
import type { TrackSelect } from './TrackSelect.js';
import type { CategorySelect } from './CategorySelect.js';
import type { Song } from '../../utils/MidiParser.js';
import { parseMidi } from '../../utils/MidiParser.js';
import { uploadSong, songFullToSong } from '../../api/SongApi.js';

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
            this.categorySelect.onConfirm = async (categoryId, title, artist) => {
              this.categorySelect.onConfirm = null;
              this.categorySelect.onCancel = null;

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
                const message = err instanceof Error ? err.message : String(err);
                alert(`Failed to save song: ${message}`);
                console.error(err);
              }
            };
            this.categorySelect.onCancel = () => {
              this.categorySelect.onConfirm = null;
              this.categorySelect.onCancel = null;
              this.menu.setMidiStatus(this.midiInput.connected, 'Import cancelled');
            };
            this.categorySelect.show(song);
          };

          if (needsSelection) {
            this.trackSelect.onConfirm = (selection) => {
              song.selectedTrackIndices = selection.indices;
              song.trackHands = selection.hands;
              song.backgroundTracks = selection.backgroundTracks;
              this.trackSelect.onConfirm = null;
              this.trackSelect.onCancel = null;
              proceed(song, file);
            };
            this.trackSelect.onCancel = () => {
              this.menu.setMidiStatus(false, 'Import cancelled');
              this.trackSelect.onConfirm = null;
              this.trackSelect.onCancel = null;
            };
            this.trackSelect.show(song);
          } else {
            proceed(song, file);
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          alert(`Failed to import MIDI: ${message}`);
          console.error(err);
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
