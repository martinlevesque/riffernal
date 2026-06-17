import { midiToNoteName } from './helpers.js';
import { NOTE_NAMES } from './constants.js';

const META_EVENT = 0xFF;
const META_TEMPO = 0x51;
const META_TRACK_NAME = 0x03;
const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;

class MidiReader {
  constructor(buffer) {
    this.data = new Uint8Array(buffer);
    this.pos = 0;
  }

  readByte() {
    return this.data[this.pos++];
  }

  readUint16BE() {
    return (this.data[this.pos++] << 8) | this.data[this.pos++];
  }

  readUint32BE() {
    return (this.data[this.pos++] << 24) |
           (this.data[this.pos++] << 16) |
           (this.data[this.pos++] << 8) |
           this.data[this.pos++];
  }

  readVarLen() {
    let value = 0;
    let b;
    for (let i = 0; i < 4; i++) {
      b = this.readByte();
      value = (value << 7) | (b & 0x7F);
      if (!(b & 0x80)) break;
    }
    return value;
  }

  skip(n) {
    this.pos += n;
  }

  eof() {
    return this.pos >= this.data.length;
  }
}

function buildTempoMap(tempoEvents, ticksPerQuarter) {
  if (tempoEvents.length === 0) {
    return [{ tick: 0, usPerQuarter: 500000 }];
  }

  const sorted = [...tempoEvents].sort((a, b) => a.tick - b.tick);
  const map = [];
  for (const ev of sorted) {
    map.push({ tick: ev.tick, usPerQuarter: ev.usPerQuarter });
  }
  return map;
}

function ticksToSeconds(tick, tempoMap, ticksPerQuarter) {
  let seconds = 0;
  let segmentStart = 0;
  let usPerQuarter = 500000;

  for (const seg of tempoMap) {
    if (tick < seg.tick) break;
    if (seg.tick > segmentStart) {
      const dt = seg.tick - segmentStart;
      seconds += (dt / ticksPerQuarter) * (usPerQuarter / 1_000_000);
    }
    segmentStart = seg.tick;
    usPerQuarter = seg.usPerQuarter;
  }

  if (tick > segmentStart) {
    const dt = tick - segmentStart;
    seconds += (dt / ticksPerQuarter) * (usPerQuarter / 1_000_000);
  }

  return seconds;
}

function extractBpm(tempoMap) {
  if (tempoMap.length === 0) return 120;
  const first = tempoMap[0].usPerQuarter;
  return Math.round(60_000_000 / first);
}

export function parseMidi(arrayBuffer, filename) {
  const reader = new MidiReader(arrayBuffer);

  const headerType = String.fromCharCode(reader.readByte(), reader.readByte(), reader.readByte(), reader.readByte());
  if (headerType !== 'MThd') {
    throw new Error('Not a valid MIDI file');
  }

  const headerLength = reader.readUint32BE();
  if (headerLength < 6) {
    throw new Error('Invalid MIDI header length');
  }

  const format = reader.readUint16BE();
  const numTracks = reader.readUint16BE();
  const division = reader.readUint16BE();

  if (format > 1) {
    throw new Error('MIDI format 2 not supported');
  }

  const ticksPerQuarter = division & 0x7FFF;
  if (division & 0x8000) {
    throw new Error('SMPTE time division not supported');
  }

  const tempoEvents = [];
  const rawNotes = [];
  let trackName = '';

  for (let t = 0; t < numTracks; t++) {
    const chunkType = String.fromCharCode(reader.readByte(), reader.readByte(), reader.readByte(), reader.readByte());
    if (chunkType !== 'MTrk') {
      throw new Error(`Expected MTrk chunk, got ${chunkType}`);
    }

    const trackLength = reader.readUint32BE();
    const trackEnd = reader.pos + trackLength;

    let runningStatus = 0;
    let absTick = 0;

    while (reader.pos < trackEnd) {
      const delta = reader.readVarLen();
      absTick += delta;

      let status = reader.readByte();

      if (status < 0x80) {
        reader.pos--;
        status = runningStatus;
      } else {
        runningStatus = status;
      }

      if (status === META_EVENT) {
        const type = reader.readByte();
        const len = reader.readVarLen();
        const dataStart = reader.pos;

        if (type === META_TEMPO && len >= 3) {
          const usPerQuarter = (reader.readByte() << 16) | (reader.readByte() << 8) | reader.readByte();
          tempoEvents.push({ tick: absTick, usPerQuarter });
        } else if (type === META_TRACK_NAME && len > 0 && !trackName) {
          let name = '';
          for (let i = 0; i < len; i++) {
            name += String.fromCharCode(reader.readByte());
          }
          trackName = name.trim();
        }

        reader.pos = dataStart + len;
      } else if (status === 0xF0 || status === 0xF7) {
        const len = reader.readVarLen();
        reader.skip(len);
      } else {
        const eventType = status & 0xF0;
        const channel = status & 0x0F;

        if (eventType === NOTE_ON || eventType === NOTE_OFF) {
          const note = reader.readByte();
          const velocity = reader.readByte();

          rawNotes.push({
            tick: absTick,
            type: eventType,
            note,
            velocity,
            channel,
          });
        } else {
          const dataLen = (eventType === 0xC0 || eventType === 0xD0) ? 1 : 2;
          reader.skip(dataLen);
        }
      }
    }

    reader.pos = trackEnd;
  }

  const tempoMap = buildTempoMap(tempoEvents, ticksPerQuarter);

  const noteOns = {};
  const notes = [];
  let skipped = 0;

  for (const raw of rawNotes) {
    const time = ticksToSeconds(raw.tick, tempoMap, ticksPerQuarter);
    const noteName = midiToNoteName(raw.note);

    if (!NOTE_NAMES.includes(noteName)) {
      skipped++;
      continue;
    }

    if (raw.type === NOTE_ON && raw.velocity > 0) {
      const key = `${noteName}_${raw.channel}`;
      if (!noteOns[key]) {
        noteOns[key] = [];
      }
      noteOns[key].push({ time, noteName });
    } else if (raw.type === NOTE_OFF || (raw.type === NOTE_ON && raw.velocity === 0)) {
      const key = `${noteName}_${raw.channel}`;
      if (noteOns[key] && noteOns[key].length > 0) {
        const on = noteOns[key].shift();
        const duration = Math.max(0.01, time - on.time);
        notes.push({ time: on.time, key: on.noteName, duration });
      }
    }
  }

  for (const key in noteOns) {
    for (const on of noteOns[key]) {
      notes.push({ time: on.time, key: on.noteName, duration: 0.1 });
    }
  }

  if (notes.length === 0) {
    throw new Error('No playable notes found in MIDI file' + (skipped > 0 ? ` (${skipped} notes outside C3-B4 range)` : ''));
  }

  if (skipped > 0) {
    console.warn(`Skipped ${skipped} notes outside the C3–B4 range`);
  }

  notes.sort((a, b) => a.time - b.time);

  const title = filename.replace(/\.[^.]+$/, '') || 'Imported';

  return {
    title,
    artist: trackName || 'Imported',
    bpm: extractBpm(tempoMap),
    difficulty: 'medium',
    notes,
    imported: true,
  };
}
