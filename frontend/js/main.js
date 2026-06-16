import { Game } from './game/Game.js';
import { Synth } from './audio/Synth.js';
import { KeyboardInput } from './input/KeyboardInput.js';
import { MidiInput } from './input/MidiInput.js';
import { Menu } from './ui/Menu.js';
import { ScoreDisplay } from './ui/ScoreDisplay.js';

const SONG_FILES = [
  'assets/songs/bed-of-razors.json',
  'assets/songs/frere-jacques.json',
  'assets/songs/iron-rain.json',
  'assets/songs/steel-thunder.json',
  'assets/songs/night-rider.json',
];

async function loadSongs() {
  const songs = [];
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

async function init() {
  const canvas = document.getElementById('gameCanvas');
  const synth = new Synth();
  const keyboardInput = new KeyboardInput();
  const midiInput = new MidiInput();

  const game = new Game(canvas, synth, keyboardInput, midiInput);
  const scoreDisplay = new ScoreDisplay();
  game.scoreDisplay = scoreDisplay;

  const speedValue = document.getElementById('speed-value');
  const speedDown = document.getElementById('speed-down');
  const speedUp = document.getElementById('speed-up');

  function updateSpeedDisplay() {
    speedValue.textContent = Math.round(game.speedMultiplier * 100) + '%';
  }

  function changeSpeed(delta) {
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
    document.getElementById('song-list').innerHTML = '<p class="error">Failed to load songs. Please refresh the page.</p>';
    document.getElementById('btn-start').disabled = true;
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

  document.getElementById('btn-retry').addEventListener('click', () => game.retry());
  document.getElementById('btn-menu').addEventListener('click', () => game.backToMenu());
  document.getElementById('btn-restart').addEventListener('click', () => game.retry());

  document.addEventListener('keydown', (e) => {
    if (game.state !== 'playing') return;
    if (e.code === 'KeyR') {
      game.retry();
    }
  });
}

init();
