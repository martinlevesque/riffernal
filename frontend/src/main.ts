import { Game } from './game/Game.js';
import { Synth } from './audio/Synth.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { MidiInput } from './input/MidiInput.js';
import { Menu } from './ui/Menu.js';
import { ScoreDisplay } from './ui/ScoreDisplay.js';
import { parseMidi } from './utils/MidiParser.js';
import type { Song } from './types.js';

const SHEET_STAFF_LINE_SPACING = 10;
const BASE_SHEET_HEIGHT = 5 + 4 * SHEET_STAFF_LINE_SPACING + 8 + 4 * SHEET_STAFF_LINE_SPACING + 5;

const SONG_FILES = [
  'assets/songs/bed-of-razors.json',
  'assets/songs/frere-jacques.json',
  'assets/songs/iron-rain.json',
  'assets/songs/steel-thunder.json',
  'assets/songs/night-rider.json',
];

async function loadSongs(): Promise<Song[]> {
  const songs: Song[] = [];
  for (const file of SONG_FILES) {
    try {
      const res = await fetch(file);
      if (res.ok) {
        songs.push(await res.json());
      }
    } catch (e) {
      console.warn(`Failed to load ${file}:`, e);
    }
  }
  return songs;
}

async function init(): Promise<void> {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const synth = new Synth();
  const keyboardInput = new KeyboardInput();
  const midiInput = new MidiInput();

  const game = new Game(canvas, synth, keyboardInput, midiInput);
  const scoreDisplay = new ScoreDisplay();
  game.scoreDisplay = scoreDisplay;

  const speedValue = document.getElementById('speed-value')!;
  const speedDown = document.getElementById('speed-down')!;
  const speedUp = document.getElementById('speed-up')!;

  function updateSpeedDisplay(): void {
    speedValue.textContent = Math.round(game.speedMultiplier * 100) + '%';
  }

  function changeSpeed(delta: number): void {
    const newSpeed = Math.round((game.speedMultiplier + delta) * 10) / 10;
    game.setSpeed(newSpeed);
    updateSpeedDisplay();
  }

  speedDown.addEventListener('click', () => changeSpeed(-0.1));
  speedUp.addEventListener('click', () => changeSpeed(0.1));

  document.addEventListener('keydown', (e) => {
    if (game.state !== 'playing') return;
    if (e.code === 'BracketLeft') {
      changeSpeed(-0.1);
    } else if (e.code === 'BracketRight') {
      changeSpeed(0.1);
    }
  });

  updateSpeedDisplay();

  const songs = await loadSongs();
  if (songs.length === 0) {
    document.getElementById('song-list')!.innerHTML = '<p class="error">Failed to load songs. Please refresh the page.</p>';
    (document.getElementById('btn-start') as HTMLButtonElement).disabled = true;
  }
  const menu = new Menu(songs);
  menu.onStart = (song) => game.start(song);

  await midiInput.start();
  menu.setMidiStatus(
    midiInput.connected,
    midiInput.connected ? 'MIDI device connected' : 'No MIDI device - use keyboard'
  );

  midiInput.onConnectionChange = (connected, message) => {
    menu.setMidiStatus(connected, message);
  };

  document.getElementById('btn-retry')!.addEventListener('click', () => game.retry());
  document.getElementById('btn-menu')!.addEventListener('click', () => game.backToMenu());
  document.getElementById('btn-restart')!.addEventListener('click', () => game.retry());

  const importBtn = document.getElementById('btn-import-midi')! as HTMLButtonElement;
  const importInput = document.getElementById('midi-import-input')! as HTMLInputElement;

  importBtn.addEventListener('click', () => {
    importInput.click();
  });

  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const song = parseMidi(reader.result as ArrayBuffer, file.name);
        menu.addSong(song);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        alert('Failed to import MIDI: ' + message);
        console.error(err);
      }
      importInput.value = '';
    };
    reader.onerror = () => {
      alert('Failed to read file');
      importInput.value = '';
    };
    reader.readAsArrayBuffer(file);
  });

  const resizeHandle = document.getElementById('sheet-resize-handle')!;
  let resizing = false;

  resizeHandle.addEventListener('pointerdown', (e) => {
    resizing = true;
    resizeHandle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!resizing) return;
    if (game.state !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minSheetHeight = BASE_SHEET_HEIGHT * 0.5;
    const maxSheetHeight = canvas.height * 0.35;
    const targetHeight = Math.max(minSheetHeight, Math.min(maxSheetHeight, y));
    game.renderer.sheetScale = targetHeight / BASE_SHEET_HEIGHT;
  });

  window.addEventListener('pointerup', () => {
    resizing = false;
  });

  document.addEventListener('keydown', (e) => {
    if (game.state !== 'playing') return;
    if (e.code === 'KeyR') {
      game.retry();
    }
  });
}

init();
