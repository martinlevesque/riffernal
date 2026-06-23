import { midiToNoteName, noteNameToMidi } from '../utils/helpers.js';
import { NOTE_NAMES, HandSide, HAND_SPLIT_MIDI, GM_DRUM_CHANNEL } from './notes.js';

export interface Note {
  time: number;
  key: string;
  duration: number;
  track?: number;
  channel?: number;
  rawMidi?: number;
  program?: number;
}

export interface TrackInfo {
  index: number;
  name: string;
  noteCount: number;
  program: number;
}

export interface Song {
  title: string;
  artist: string;
  bpm: number;
  difficulty: string;
  notes: Note[];
  imported?: boolean;
  tracks?: TrackInfo[];
  selectedTrackIndices?: number[];
  trackHands?: Record<number, HandSide>;
  backgroundTracks?: number[];
}

export function normalizeSong(song: Song): Song {
  if (!song.tracks) song.tracks = [];
  if (!song.selectedTrackIndices) song.selectedTrackIndices = [];
  if (!song.trackHands) song.trackHands = {};
  if (!song.backgroundTracks) {
    const selectedSet = new Set(song.selectedTrackIndices);
    song.backgroundTracks = song.tracks
      .map((t) => t.index)
      .filter((i) => !selectedSet.has(i));
  }
  return song;
}

const META_EVENT = 0xFF;
const META_TEMPO = 0x51;
const META_TRACK_NAME = 0x03;
const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const PROGRAM_CHANGE = 0xC0;

const GM_INSTRUMENTS: Record<number, string> = {
  0: 'Piano', 1: 'Bright Piano', 2: 'Elec Grand Piano', 3: 'Honky-tonk Piano',
  4: 'Elec Piano 1', 5: 'Elec Piano 2', 6: 'Harpsichord', 7: 'Clavinet',
  8: 'Celesta', 9: 'Glockenspiel', 10: 'Music Box', 11: 'Vibraphone',
  12: 'Marimba', 13: 'Xylophone', 14: 'Tubular Bells', 15: 'Dulcimer',
  16: 'Drawbar Organ', 17: 'Perc Organ', 18: 'Rock Organ', 19: 'Church Organ',
  20: 'Reed Organ', 21: 'Accordion', 22: 'Harmonica', 23: 'Tango Accordion',
  24: 'Nylon Guitar', 25: 'Steel Guitar', 26: 'Jazz Guitar', 27: 'Clean Guitar',
  28: 'Muted Guitar', 29: 'Overdriven Guitar', 30: 'Distortion Guitar', 31: 'Guitar Harmonics',
  32: 'Acoustic Bass', 33: 'Finger Bass', 34: 'Pick Bass', 35: 'Fretless Bass',
  36: 'Slap Bass 1', 37: 'Slap Bass 2', 38: 'Synth Bass 1', 39: 'Synth Bass 2',
  40: 'Violin', 41: 'Viola', 42: 'Cello', 43: 'Contrabass',
  44: 'Tremolo Strings', 45: 'Pizzicato Strings', 46: 'Orchestral Harp', 47: 'Timpani',
  48: 'String Ensemble', 49: 'String Ens 2', 50: 'Synth Strings 1', 51: 'Synth Strings 2',
  52: 'Choir Aahs', 53: 'Voice Oohs', 54: 'Synth Choir', 55: 'Orchestra Hit',
  56: 'Trumpet', 57: 'Trombone', 58: 'Tuba', 59: 'Muted Trumpet',
  60: 'French Horn', 61: 'Brass Section', 62: 'Synth Brass 1', 63: 'Synth Brass 2',
  64: 'Soprano Sax', 65: 'Alto Sax', 66: 'Tenor Sax', 67: 'Baritone Sax',
  68: 'Oboe', 69: 'English Horn', 70: 'Bassoon', 71: 'Clarinet',
  72: 'Piccolo', 73: 'Flute', 74: 'Recorder', 75: 'Pan Flute',
  76: 'Blown Bottle', 77: 'Shakuhachi', 78: 'Whistle', 79: 'Ocarina',
  80: 'Square Lead', 81: 'Sawtooth Lead', 82: 'Calliope Lead', 83: 'Chiff Lead',
  84: 'Charang Lead', 85: 'Voice Lead', 86: 'Fifths Lead', 87: 'Bass Lead',
  88: 'New Age Pad', 89: 'Warm Pad', 90: 'Polysynth Pad', 91: 'Choir Pad',
  92: 'Bowed Pad', 93: 'Metallic Pad', 94: 'Halo Pad', 95: 'Sweep Pad',
  96: 'Rain FX', 97: 'Soundtrack FX', 98: 'Crystal FX', 99: 'Atmosphere FX',
  100: 'Brightness FX', 101: 'Goblins FX', 102: 'Echoes FX', 103: 'Sci-fi FX',
  104: 'Sitar', 105: 'Banjo', 106: 'Shamisen', 107: 'Koto',
  108: 'Kalimba', 109: 'Bagpipe', 110: 'Fiddle', 111: 'Shanai',
  112: 'Tinkle Bell', 113: 'Agogo', 114: 'Steel Drums', 115: 'Woodblock',
  116: 'Taiko Drum', 117: 'Melodic Tom', 118: 'Synth Drum', 119: 'Reverse Cymbal',
  120: 'Guitar Fret Noise', 121: 'Breath Noise', 122: 'Seashore', 123: 'Bird Tweet',
  124: 'Telephone Ring', 125: 'Helicopter', 126: 'Applause', 127: 'Gunshot',
};

interface TempoEvent {
  tick: number;
  usPerQuarter: number;
}

interface RawNote {
  tick: number;
  type: number;
  note: number;
  velocity: number;
  channel: number;
}

interface TrackNoteOnEntry {
  time: number;
  noteName: string;
  channel: number;
  rawMidi: number;
  program: number;
}

class MidiReader {
  private data: Uint8Array;
  pos = 0;

  constructor(buffer: ArrayBuffer) {
    this.data = new Uint8Array(buffer);
  }

  readByte(): number {
    return this.data[this.pos++];
  }

  readUint16BE(): number {
    return (this.data[this.pos++] << 8) | this.data[this.pos++];
  }

  readUint32BE(): number {
    return (this.data[this.pos++] << 24) |
           (this.data[this.pos++] << 16) |
           (this.data[this.pos++] << 8) |
           this.data[this.pos++];
  }

  readVarLen(): number {
    let value = 0;
    let b: number;
    for (let i = 0; i < 4; i++) {
      b = this.readByte();
      value = (value << 7) | (b & 0x7F);
      if (!(b & 0x80)) break;
    }
    return value;
  }

  skip(n: number): void {
    this.pos += n;
  }

  eof(): boolean {
    return this.pos >= this.data.length;
  }
}

function buildTempoMap(tempoEvents: TempoEvent[], _ticksPerQuarter: number): TempoEvent[] {
  if (tempoEvents.length === 0) {
    return [{ tick: 0, usPerQuarter: 500000 }];
  }

  const sorted = [...tempoEvents].sort((a, b) => a.tick - b.tick);
  const map: TempoEvent[] = [];
  for (const ev of sorted) {
    map.push({ tick: ev.tick, usPerQuarter: ev.usPerQuarter });
  }
  return map;
}

function ticksToSeconds(tick: number, tempoMap: TempoEvent[], ticksPerQuarter: number): number {
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

function extractBpm(tempoMap: TempoEvent[]): number {
  if (tempoMap.length === 0) return 120;
  const first = tempoMap[0].usPerQuarter;
  return Math.round(60_000_000 / first);
}

function transposeIntoRange(noteName: string): string {
  const midiNum = noteNameToMidi(noteName);
  const lowestMidi = noteNameToMidi(NOTE_NAMES[0]);
  const highestMidi = noteNameToMidi(NOTE_NAMES[NOTE_NAMES.length - 1]);

  if (midiNum < lowestMidi) {
    const octaves = Math.ceil((lowestMidi - midiNum) / 12);
    return midiToNoteName(midiNum + octaves * 12);
  }
  if (midiNum > highestMidi) {
    const octaves = Math.ceil((midiNum - highestMidi) / 12);
    return midiToNoteName(midiNum - octaves * 12);
  }
  return noteName;
}

export function parseMidi(arrayBuffer: ArrayBuffer, filename: string): Song {
  const reader = new MidiReader(arrayBuffer);

  const headerType = String.fromCharCode(reader.readByte(), reader.readByte(), reader.readByte(), reader.readByte());
  if (headerType !== 'MThd') {
    throw new Error('Not a valid MIDI file');
  }

  const headerLength = reader.readUint32BE();
  if (headerLength < 6) {
    throw new Error('Invalid MIDI header length');
  }

  const _format = reader.readUint16BE();
  const numTracks = reader.readUint16BE();
  const division = reader.readUint16BE();

  if (_format > 1) {
    throw new Error('MIDI format 2 not supported');
  }

  const ticksPerQuarter = division & 0x7FFF;
  if (division & 0x8000) {
    throw new Error('SMPTE time division not supported');
  }

  const tempoEvents: TempoEvent[] = [];
  const trackRawNotes: RawNote[][] = [];
  const trackNames: string[] = [];
  const trackChannels: Set<number>[] = [];
  const trackPrograms: number[] = [];

  for (let t = 0; t < numTracks; t++) {
    const chunkType = String.fromCharCode(reader.readByte(), reader.readByte(), reader.readByte(), reader.readByte());
    if (chunkType !== 'MTrk') {
      throw new Error(`Expected MTrk chunk, got ${chunkType}`);
    }

    const trackLength = reader.readUint32BE();
    const trackEnd = reader.pos + trackLength;

    let runningStatus = 0;
    let absTick = 0;
    let hasTrackName = false;
    const notes: RawNote[] = [];
    const channels = new Set<number>();

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
        } else if (type === META_TRACK_NAME && len > 0 && !hasTrackName) {
          hasTrackName = true;
          let name = '';
          for (let i = 0; i < len; i++) {
            name += String.fromCharCode(reader.readByte());
          }
          trackNames[t] = name.trim();
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
          channels.add(channel);

          notes.push({
            tick: absTick,
            type: eventType,
            note,
            velocity,
            channel,
          });
        } else if (eventType === PROGRAM_CHANGE) {
          trackPrograms[t] = reader.readByte();
        } else {
          const dataLen = (eventType === 0xD0) ? 1 : 2;
          reader.skip(dataLen);
        }
      }
    }

    trackRawNotes[t] = notes;
    trackChannels[t] = channels;
    reader.pos = trackEnd;
  }

  const tempoMap = buildTempoMap(tempoEvents, ticksPerQuarter);

  const trackNoteOns: TrackNoteOnEntry[][] = trackRawNotes.map(() => []);
  const allNotes: Note[] = [];
  let skipped = 0;
  let transposed = 0;

  for (let t = 0; t < trackRawNotes.length; t++) {
    for (const raw of trackRawNotes[t]) {
      const time = ticksToSeconds(raw.tick, tempoMap, ticksPerQuarter);
      let noteName = midiToNoteName(raw.note);

      if (!NOTE_NAMES.includes(noteName)) {
        const transposedName = transposeIntoRange(noteName);
        if (!NOTE_NAMES.includes(transposedName)) {
          skipped++;
          continue;
        }
        transposed++;
        noteName = transposedName;
      }

      if (raw.type === NOTE_ON && raw.velocity > 0) {
        trackNoteOns[t].push({ time, noteName, channel: raw.channel, rawMidi: raw.note, program: trackPrograms[t] ?? -1 });
      } else if (raw.type === NOTE_OFF || (raw.type === NOTE_ON && raw.velocity === 0)) {
        const on = trackNoteOns[t].find((e) => e.noteName === noteName);
        if (on) {
          trackNoteOns[t].splice(trackNoteOns[t].indexOf(on), 1);
          const duration = Math.max(0.01, time - on.time);
          allNotes.push({ time: on.time, key: on.noteName, duration, track: t, channel: raw.channel, rawMidi: raw.note, program: on.program });
        }
      }
    }
  }

  for (let t = 0; t < trackNoteOns.length; t++) {
    for (const on of trackNoteOns[t]) {
      allNotes.push({ time: on.time, key: on.noteName, duration: 0.1, track: t, channel: on.channel, rawMidi: on.rawMidi, program: on.program });
    }
  }

  if (allNotes.length === 0) {
    throw new Error(`No playable notes found in MIDI file${skipped > 0 ? ` (${skipped} notes outside A0–C8 range)` : ''}`);
  }

  if (skipped > 0) {
    console.warn(`Skipped ${skipped} notes outside the A0–C8 range`);
  }
  if (transposed > 0) {
    console.warn(`Transposed ${transposed} notes into the A0–C8 range`);
  }

  allNotes.sort((a, b) => a.time - b.time);

  const tracks: TrackInfo[] = trackRawNotes.map((notes, i) => {
    const isDrumTrack = trackChannels[i]?.size === 1 && trackChannels[i]?.has(GM_DRUM_CHANNEL);
    return {
    index: i,
    name: isDrumTrack ? 'Drums' : (trackNames[i] || GM_INSTRUMENTS[trackPrograms[i]] || `Track ${i + 1}`),
    noteCount: notes.filter((raw) => {
      const noteName = midiToNoteName(raw.note);
      return NOTE_NAMES.includes(noteName) || NOTE_NAMES.includes(transposeIntoRange(noteName));
    }).length,
    program: isDrumTrack ? -1 : (trackPrograms[i] ?? -1),
    };
  }).filter((t) => t.noteCount > 0);

  // Remap original track indices to compact indices (0, 1, 2, ...)
  // so non-playable tracks are excluded and indices are contiguous.
  const oldToNew = new Map<number, number>();
  for (let i = 0; i < tracks.length; i++) {
    oldToNew.set(tracks[i].index, i);
    tracks[i].index = i;
  }

  for (const note of allNotes) {
    note.track = oldToNew.get(note.track!) ?? 0;
  }

  const trackHands: Record<number, HandSide> = {};
  for (const track of tracks) {
    const trackNotes = allNotes.filter((n) => n.track === track.index);
    if (trackNotes.length === 0) continue;
    let sum = 0;
    let leftCount = 0;
    let rightCount = 0;
    for (const n of trackNotes) {
      const midi = noteNameToMidi(n.key);
      if (midi < 0) continue;
      sum += midi;
      if (midi <= HAND_SPLIT_MIDI) leftCount++; else rightCount++;
    }
    // If a track clearly spans both hands (e.g. a single piano staff), leave
    // its hand unset so NoteManager falls back to per-key handForKey instead
    // of forcing every note onto one side.
    if (leftCount > 0 && rightCount > 0) continue;
    const avg = sum / trackNotes.length;
    trackHands[track.index] = avg <= HAND_SPLIT_MIDI ? HandSide.Left : HandSide.Right;
  }

  const title = filename.replace(/\.[^.]+$/, '') || 'Imported';
  const selectedTrackIndices = tracks.length <= 2 ? tracks.map((t) => t.index) : [];
  const selectedSet = new Set(selectedTrackIndices);
  const backgroundTracks = tracks.map((t) => t.index).filter((i) => !selectedSet.has(i));
  const artist = tracks.length === 1
    ? (trackNames.find((n) => n) || 'Imported')
    : 'Imported';

  return {
    title,
    artist,
    bpm: extractBpm(tempoMap),
    difficulty: 'medium',
    notes: allNotes,
    imported: true,
    tracks,
    selectedTrackIndices,
    trackHands,
    backgroundTracks,
  };
}
