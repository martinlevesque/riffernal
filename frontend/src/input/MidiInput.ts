import { midiToNoteName } from '../utils/helpers.js';
import { NOTE_TO_LANE } from '../utils/notes.js';
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
      console.log('[MIDI] Access granted.');
      this._logDevices();
      this.midiAccess.onstatechange = (e) => {
        console.log('[MIDI] statechange:', e?.port?.name, e?.port?.state, e?.port?.connection);
        this._onStateChange();
      };
      this._connectInputs();
      return true;
    } catch (_err) {
      console.warn('[MIDI] Access denied:', _err);
      this._updateStatus(false, 'MIDI access denied');
      return false;
    }
  }

  private _logDevices(): void {
    if (!this.midiAccess) return;
    const inputs = Array.from(this.midiAccess.inputs.values()).map(i => `${i.name} (${i.manufacturer ?? '?'})`);
    const outputs = Array.from(this.midiAccess.outputs.values()).map(o => `${o.name} (${o.manufacturer ?? '?'})`);
    console.log('[MIDI] inputs:', inputs);
    console.log('[MIDI] outputs:', outputs);
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

    this._logDevices();

    let found = false;
    for (const input of this.midiAccess.inputs.values()) {
      console.log('[MIDI] Connecting input:', input.name, input.manufacturer);
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

    const data = event.data ?? [];
    const [status, data1, data2] = data;
    const command = status & 0xf0;
    const noteNumber = data1;
    const velocity = data2;

    const noteName = midiToNoteName(noteNumber);
    if (!noteName || !NOTE_TO_LANE.has(noteName)) {
      console.log('[MIDI] Ignored:', data, '->', noteName);
      return;
    }

    if (command === 0x90 && velocity > 0) {
      console.log('[MIDI] Note On:', noteName, 'vel', velocity);
      if (this.onNoteOn) this.onNoteOn(noteName, `midi_${noteNumber}`);
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      console.log('[MIDI] Note Off:', noteName);
      if (this.onNoteOff) this.onNoteOff(noteName, `midi_${noteNumber}`);
    }
  }

  private _updateStatus(connected: boolean, message: string): void {
    if (this.onConnectionChange) {
      this.onConnectionChange(connected, message);
    }
  }
}
