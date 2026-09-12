import { midiToNoteName } from '../utils/helpers.js';
import { NOTE_TO_LANE } from '../utils/notes.js';
import { InputDeviceState } from './InputDeviceState.js';
import type { NoteOnCallback, NoteOffCallback, ConnectionChangeCallback } from './types.js';
import { InputDeviceType } from './types.js';

export class MidiInput {
  onNoteOn: NoteOnCallback | null = null;
  onNoteOff: NoteOffCallback | null = null;
  onConnectionChange: ConnectionChangeCallback | null = null;
  private _midiAccess: MIDIAccess | null = null;
  enabled = true;
  connected = false;
  readonly device = new InputDeviceState(InputDeviceType.ComputerKeyboard);
  private _onMidiMessage: (event: MIDIMessageEvent) => void;
  private _heldNotes = new Set<number>();

  constructor() {
    this._onMidiMessage = (event) => this._handleMidiMessage(event);
  }

  async start(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) {
      this._updateStatus(false, 'Web MIDI not supported');
      return false;
    }

    try {
      this._midiAccess = await navigator.requestMIDIAccess();
      console.log('[MIDI] Access granted.');
      this._logDevices();
      this._midiAccess.onstatechange = (e) => {
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
    if (!this._midiAccess) return;
    const inputs = Array.from(this._midiAccess.inputs.values()).map(i => `${i.name} (${i.manufacturer ?? '?'})`);
    const outputs = Array.from(this._midiAccess.outputs.values()).map(o => `${o.name} (${o.manufacturer ?? '?'})`);
    console.log('[MIDI] inputs:', inputs);
    console.log('[MIDI] outputs:', outputs);
  }

  stop(): void {
    this._heldNotes.clear();
    if (this._midiAccess) {
      for (const input of this._midiAccess.inputs.values()) {
        input.onmidimessage = null;
      }
    }
    this.connected = false;
  }

  private static _isVirtualPort(input: MIDIInput): boolean {
    const name = (input.name ?? '').toLowerCase();
    return name.includes('through') || name.includes('loopback') || name.includes('virtual');
  }

  private _connectInputs(): void {
    if (!this._midiAccess) return;

    this._heldNotes.clear();
    this._logDevices();

    const activeInputs: MIDIInput[] = [];
    for (const input of this._midiAccess.inputs.values()) {
      if (input.state !== 'connected' || input.connection === 'pending') continue;
      if (MidiInput._isVirtualPort(input)) {
        console.log('[MIDI] Skipping virtual port:', input.name);
        continue;
      }
      activeInputs.push(input);
    }

    if (activeInputs.length > 0) {
      for (const input of activeInputs) {
        console.log('[MIDI] Connecting input:', input.name, input.manufacturer);
        input.onmidimessage = this._onMidiMessage;
      }

      this.connected = true;
      const names = activeInputs.map(i => i.name);
      this._updateStatus(true, `Connected: ${names.join(', ')}`);
    } else {
      this.connected = false;
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
      return;
    }

    if (command === 0x90 && velocity > 0) {
      if (this._heldNotes.has(noteNumber)) {
        return;
      }
      this._heldNotes.add(noteNumber);
      if (this.onNoteOn) this.onNoteOn(noteName, `midi_${noteNumber}`, velocity);
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      this._heldNotes.delete(noteNumber);
      if (this.onNoteOff) this.onNoteOff(noteName, `midi_${noteNumber}`);
    }
  }

  private _updateStatus(connected: boolean, message: string): void {
    this.device.setType(connected ? InputDeviceType.Midi : InputDeviceType.ComputerKeyboard, message);

    if (this.onConnectionChange) {
      this.onConnectionChange(connected, message);
    }
  }
}
