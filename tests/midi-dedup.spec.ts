import { test, expect } from '@playwright/test';
import { makeSong } from './helpers.js';

// Reproduce the real MIDI file structure:
// Track 0 = Janne (selected), Tracks 1-4 = background
// Opening melody — notes are 144ms apart, each 144ms duration.
const JANNE_MELODY = [
  { time: 0.500, key: 'A4', duration: 0.144, track: 0 },
  { time: 0.644, key: 'F4', duration: 0.144, track: 0 },
  { time: 0.788, key: 'E4', duration: 0.144, track: 0 },
  { time: 0.932, key: 'D4', duration: 0.144, track: 0 },
  { time: 1.076, key: 'E4', duration: 0.144, track: 0 },
  { time: 1.220, key: 'F4', duration: 0.144, track: 0 },
  { time: 1.364, key: 'G#4', duration: 0.144, track: 0 },
  { time: 1.508, key: 'F4', duration: 0.144, track: 0 },
  { time: 1.652, key: 'E4', duration: 0.144, track: 0 },
  { time: 1.796, key: 'D4', duration: 0.144, track: 0 },
];

const BG_NOTES = [
  { time: 0.500, key: 'E2', duration: 0.5, track: 1 },
  { time: 1, key: 'A2', duration: 0.5, track: 1 },
  { time: 1.500, key: 'E2', duration: 0.5, track: 1 },
  { time: 0.500, key: 'B2', duration: 0.25, track: 2 },
  { time: 0.750, key: 'D3', duration: 0.25, track: 2 },
  { time: 1, key: 'B2', duration: 0.25, track: 2 },
  { time: 1.250, key: 'D3', duration: 0.25, track: 2 },
  { time: 1.500, key: 'B2', duration: 0.25, track: 2 },
  { time: 0.500, key: 'E1', duration: 0.5, track: 3 },
  { time: 1, key: 'A1', duration: 0.5, track: 3 },
  { time: 1.500, key: 'E1', duration: 0.5, track: 3 },
];

const ALL_NOTES = [...JANNE_MELODY, ...BG_NOTES, { time: 5.0, key: 'C4', duration: 0.25, track: 0 }];

test('Learn mode: duplicate MIDI Note On does not produce Wrong', async ({ page }) => {
  test.setTimeout(15000);

  const songData = {
    ...makeSong(ALL_NOTES, 'WrongBugDedup'),
    tracks: [
      { index: 0, name: 'Janne', noteCount: JANNE_MELODY.length },
      { index: 1, name: 'Alexi', noteCount: 3 },
      { index: 2, name: 'Jonne', noteCount: 5 },
      { index: 3, name: 'Henkka', noteCount: 3 },
    ],
    selectedTrackIndices: [0],
    backgroundTracks: [1, 2, 3],
  };
  const songJson = JSON.stringify(songData);

  await page.goto('/');

  const result = await page.evaluate(`(async () => {
    const { Game } = await import('/js/game/Game.js');
    const { Synth } = await import('/js/audio/Synth.js');
    const { KeyboardInput } = await import('/js/input/KeyboardInput.js');
    const { MidiInput } = await import('/js/input/MidiInput.js');

    const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    const NOTE_TO_MIDI = {};
    for (let oct = 0; oct <= 8; oct++) {
      for (let i = 0; i < 12; i++) {
        NOTE_TO_MIDI[NOTE_NAMES[i] + oct] = oct * 12 + i + 12;
      }
    }
    function noteOn(name) { return new Uint8Array([0x90, NOTE_TO_MIDI[name], 64]); }
    function noteOff(name) { return new Uint8Array([0x80, NOTE_TO_MIDI[name], 0]); }

    const canvas = document.getElementById('gameCanvas');
    const midiInput = new MidiInput();
    const game = new Game(canvas, new Synth(), new KeyboardInput(), midiInput);
    game.start(${songJson});
    game.setLearningMode(true);

    // Wait until game freezes at first note (poll currentTime stability)
    await new Promise((resolve) => {
      let last = Infinity, stable = 0;
      const poll = setInterval(() => {
        if (game.currentTime === last) {
          if (++stable >= 3) { clearInterval(poll); resolve(undefined); }
        } else stable = 0;
        last = game.currentTime;
      }, 60);
    });

    // At this point game.currentTime should be frozen at ~0.5 (first note time)
    const frozenTime = game.currentTime;

    const noteNames = ['A4','F4','E4','D4','E4','F4','G#4','F4','E4','D4'];
    const handler = midiInput._onMidiMessage;

    const wrongBefore = game.noteManager.scoring.wrongNotes;
    const scoreBefore = game.noteManager.scoring.score;

    for (const name of noteNames) {
      // Send duplicate Note On (no Note Off in between) — exactly like the real keyboard
      handler({ data: noteOn(name) });
      handler({ data: noteOn(name) });
      // Send Note Off to reset the held-note state before the next key
      handler({ data: noteOff(name) });
      // Wait for the game clock to advance to the next frozen note before pressing the next key
      await new Promise(r => setTimeout(r, 150));
    }

    await new Promise(r => setTimeout(r, 200));

    return {
      frozenTime,
      wrongNotes: game.noteManager.scoring.wrongNotes - wrongBefore,
      scoreDelta: game.noteManager.scoring.score - scoreBefore,
      notesHit: game.noteManager.notes.filter(n => n.selected && n.hit).length,
    };
  })()`) as { frozenTime: number; wrongNotes: number; scoreDelta: number; notesHit: number };

  expect(result.frozenTime).toBeGreaterThan(0.4);
  expect(result.wrongNotes).toBe(0);
  expect(result.scoreDelta).toBeGreaterThan(0);
  expect(result.notesHit).toBeGreaterThanOrEqual(1);
});
