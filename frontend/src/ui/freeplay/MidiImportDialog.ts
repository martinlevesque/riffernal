import type { Menu } from './Menu.js';
import type { MidiInput } from '../../input/MidiInput.js';
import type { TrackSelect } from './TrackSelect.js';
import type { CategorySelect } from './CategorySelect.js';
import type { Song } from '../../utils/MidiParser.js';
import { parseMidi } from '../../utils/MidiParser.js';
import { uploadSong, songFullToSong } from '../../api/SongApi.js';
import { isGuestMode } from '../../api/AuthApi.js';
import { addGuestSong, GUEST_MIDI_MAX_BYTES } from '../../utils/guestStore.js';
import { reportError } from '../../utils/helpers.js';
import { estimateSongDifficulty, type Difficulty } from '../../game/difficulty.js';

export class MidiImportDialog {
  private _importBtn: HTMLButtonElement;
  private _importInput: HTMLInputElement;
  private _menu: Menu;
  private _midiInput: MidiInput;
  private _trackSelect: TrackSelect;
  private _categorySelect: CategorySelect;

  constructor(
    menu: Menu,
    midiInput: MidiInput,
    trackSelect: TrackSelect,
    categorySelect: CategorySelect,
  ) {
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
    reader.onload = () => this._importMidi(reader.result as ArrayBuffer, file, input);
    reader.onerror = () => {
      alert('Failed to read file');
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  }

  private _importMidi(buffer: ArrayBuffer, midiFile: File, input: HTMLInputElement): void {
    try {
      // Guests store the file locally instead of uploading, so the server's
      // size cap has to be enforced here too.
      if (isGuestMode() && midiFile.size > GUEST_MIDI_MAX_BYTES) {
        throw new Error('MIDI file too large (max 500 KB)');
      }

      const song = parseMidi(buffer, midiFile.name);
      this._openImportFlow(song, midiFile);
    } catch (err: unknown) {
      reportError('Failed to import MIDI', err, { alert: true });
    } finally {
      input.value = '';
    }
  }

  private _openImportFlow(song: Song, midiFile: File): void {
    if (this._needsTrackSelection(song)) {
      this._trackSelect.show(song, {
        onConfirm: (selection) => {
          song.selectedTrackIndices = selection.indices;
          song.trackHands = selection.hands;
          song.backgroundTracks = selection.backgroundTracks;
          this._pickCategory(song, midiFile);
        },
        onCancel: () => this._reportCancelled(),
      });
      return;
    }

    this._pickCategory(song, midiFile);
  }

  private _needsTrackSelection(song: Song): boolean {
    return (song.tracks?.length ?? 0) > 2 && (song.selectedTrackIndices?.length ?? 0) === 0;
  }

  private _pickCategory(song: Song, midiFile: File): void {
    // TrackSelect may have narrowed the playable set: re-estimate
    // so the picker's prefill reflects the tracks the player will
    // actually play, not every track in the file.
    song.difficulty = estimateSongDifficulty(
      song.notes,
      song.selectedTrackIndices ?? [],
      (song.tracks?.length ?? 0) > 0,
    );

    this._categorySelect.show(
      {
        onConfirm: (categoryId, title, artist, difficulty) => {
          void this._saveImportedSong(song, midiFile, categoryId, title, artist, difficulty);
        },
        onCancel: () => this._reportCancelled(),
      },
      song,
      { hideCategories: isGuestMode() },
    );
  }

  private async _saveImportedSong(
    song: Song,
    midiFile: File,
    categoryId: number | null,
    title: string,
    artist: string,
    difficulty: Difficulty,
  ): Promise<void> {
    if (isGuestMode()) {
      await this._saveGuestSong(song, midiFile, title, artist, difficulty);
      return;
    }

    try {
      const full = await uploadSong({
        midiFile,
        metadata: {
          title: title || song.title,
          artist: artist || song.artist,
          bpm: song.bpm,
          difficulty,
          notes: song.notes,
          tracks: song.tracks ?? [],
          selectedTrackIndices: song.selectedTrackIndices ?? [],
          trackHands: song.trackHands ?? {},
          backgroundTracks: song.backgroundTracks ?? [],
        },
        categoryId,
      });
      this._menu.addSong(songFullToSong(full));
      this._menu.setMidiStatus(this._midiInput.connected, 'Import complete');
    } catch (err: unknown) {
      reportError('Failed to save song', err, { alert: true });
    }
  }

  /** Guest import: keep the raw bytes + choices in the local guest store —
   *  the server is never contacted. */
  private async _saveGuestSong(
    song: Song,
    midiFile: File,
    title: string,
    artist: string,
    difficulty: Difficulty,
  ): Promise<void> {
    try {
      const guestSong = await addGuestSong({
        filename: midiFile.name,
        midiBytes: await midiFile.arrayBuffer(),
        title: title || song.title,
        artist: artist || song.artist,
        difficulty,
        selectedTrackIndices: song.selectedTrackIndices ?? [],
        trackHands: song.trackHands ?? {},
        backgroundTracks: song.backgroundTracks ?? [],
      });
      this._menu.addGuestSong(guestSong);
      this._menu.setMidiStatus(this._midiInput.connected, 'Import complete');
    } catch (err: unknown) {
      reportError('Failed to save song', err, { alert: true });
    }
  }

  private _reportCancelled(): void {
    this._menu.setMidiStatus(this._midiInput.connected, 'Import cancelled');
  }
}
