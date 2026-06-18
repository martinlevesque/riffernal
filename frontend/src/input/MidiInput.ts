import { midiToNoteName } from '../utils/helpers.js';
import { NOTE_NAMES } from '../utils/notes.js';
import type { NoteCallback, ConnectionChangeCallback } from './types.js';

export class MidiInput {
  onNoteOn: NoteCallback | null = null;
  onNoteOff: NoteCallback | null = null;
  onConnectionChange: ConnectionChangeCallback | null = null;
  private midiAccess: MIDIAccess | null = null;
  enabled = true;
  connected = false;
  private _onMidiMessage: (event: MIDIMessageEvent) => void;

  constructor() {
    this._onMidiMessage = (event) => this._handleMidiMessage(event);
  }

  async start(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) {
      this._updateStatus(false, 'Web MIDI not supported');
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.midiAccess.onstatechange = () => this._onStateChange();
      this._connectInputs();
      return true;
    } catch (_err) {
      this._updateStatus(false, 'MIDI access denied');
      return false;
    }
  }

  stop(): void {
    if (this.midiAccess) {
      for (const input of this.midiAccess.inputs.values()) {
        input.onmidimessage = null;
      }
    }
    this.connected = false;
  }

  private _connectInputs(): void {
    if (!this.midiAccess) return;

    let found = false;
    for (const input of this.midiAccess.inputs.values()) {
      input.onmidimessage = this._onMidiMessage;
      found = true;
    }

    this.connected = found;
    if (found) {
      const names = Array.from(this.midiAccess.inputs.values()).map(i => i.name);
      this._updateStatus(true, `Connected: ${names.join(', ')}`);
    } else {
      this._updateStatus(false, 'No MIDI device found');
    }
  }

  private _onStateChange(): void {
    this._connectInputs();
  }

  private _handleMidiMessage(event: MIDIMessageEvent): void {
    if (!this.enabled) return;

    const [status, data1, data2] = event.data ?? [];
    const command = status & 0xf0;
    const noteNumber = data1;
    const velocity = data2;

    const noteName = midiToNoteName(noteNumber);
    if (!noteName || !NOTE_NAMES.includes(noteName)) return;

    if (command === 0x90 && velocity > 0) {
      if (this.onNoteOn) this.onNoteOn(noteName, `midi_${noteNumber}`);
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      if (this.onNoteOff) this.onNoteOff(noteName, `midi_${noteNumber}`);
    }
  }

  private _updateStatus(connected: boolean, message: string): void {
    if (this.onConnectionChange) {
      this.onConnectionChange(connected, message);
    }
  }
}
