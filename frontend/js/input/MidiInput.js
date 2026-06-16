import { midiToNoteName } from '../utils/helpers.js';
import { NOTE_NAMES } from '../utils/constants.js';

export class MidiInput {
  constructor() {
    this.onNoteOn = null;
    this.onNoteOff = null;
    this.onConnectionChange = null;
    this.midiAccess = null;
    this.enabled = true;
    this.connected = false;
    this._onMidiMessage = this._onMidiMessage.bind(this);
  }

  async start() {
    if (!navigator.requestMIDIAccess) {
      this._updateStatus(false, 'Web MIDI not supported');
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.midiAccess.onstatechange = () => this._onStateChange();
      this._connectInputs();
      return true;
    } catch (err) {
      this._updateStatus(false, 'MIDI access denied');
      return false;
    }
  }

  stop() {
    if (this.midiAccess) {
      for (const input of this.midiAccess.inputs.values()) {
        input.onmidimessage = null;
      }
    }
    this.connected = false;
  }

  _connectInputs() {
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

  _onStateChange() {
    this._connectInputs();
  }

  _onMidiMessage(event) {
    if (!this.enabled) return;

    const [status, data1, data2] = event.data;
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

  _updateStatus(connected, message) {
    if (this.onConnectionChange) {
      this.onConnectionChange(connected, message);
    }
  }
}
