import { test, expect } from 'bun:test';
import {
  AutoVoiceScheduler,
  type AutoVoiceEntry,
} from '../../../../frontend/src/game/AutoVoiceScheduler.js';
import type { Patch } from '../../../../frontend/src/audio/patches/Patch.js';

const dummyPatch: Patch = {
  name: 'dummy',
  build: () => ({ output: {} as AudioNode, release() {} }),
};

const makeEntry = (id: string, when: number): AutoVoiceEntry => ({
  id,
  noteName: 'C3',
  patch: dummyPatch,
  when,
  durationMs: 250,
});

test('drain builds nothing while the queue is empty', () => {
  const built: AutoVoiceEntry[] = [];
  const s = new AutoVoiceScheduler((e) => built.push(e));

  s.drain(10, 1 / 60);
  expect(built).toHaveLength(0);
  expect(s.pending).toBe(0);
});

test('builds at least one voice per frame and never over the cap', () => {
  const built: AutoVoiceEntry[] = [];
  const s = new AutoVoiceScheduler((e) => built.push(e));
  for (let i = 0; i < 5; i++) s.enqueue(makeEntry(`v${i}`, 100 + 0.1));

  s.drain(100, 1 / 60); // budget = ceil(5 * 0.0167 / 0.1) = 1
  expect(built).toHaveLength(1);
  expect(s.pending).toBe(4);

  for (let i = 0; i < 100; i++) s.enqueue(makeEntry(`late${i}`, 100)); // due now
  s.drain(100, 1 / 60); // window ~0 → capped budget
  expect(s.builtThisFrame).toBeLessThanOrEqual(8);
  expect(s.lastBudget).toBeLessThanOrEqual(8);
});

test('drains the whole burst before the earliest voice is due', () => {
  const built: AutoVoiceEntry[] = [];
  const s = new AutoVoiceScheduler((e) => built.push(e));
  for (let i = 0; i < 40; i++) s.enqueue(makeEntry(`v${i}`, 100.2));

  // Simulate 60fps frames until the audio clock reaches the voices' start.
  let audioNow = 100;
  let frames = 0;
  while (s.pending > 0 && frames < 100) {
    s.drain(audioNow, 1 / 60);
    frames++;
    audioNow += 1 / 60;
  }

  expect(s.pending).toBe(0);
  expect(built).toHaveLength(40);
  // All built within the 0.2s lookahead (12 frames), not spread thin.
  expect(frames).toBeLessThanOrEqual(12);
});

test('build callback receives the full entry', () => {
  const built: AutoVoiceEntry[] = [];
  const s = new AutoVoiceScheduler((e) => built.push(e));
  s.enqueue({
    id: 'auto_1_2.5_A2',
    noteName: 'A2',
    midiOverride: 45,
    patch: dummyPatch,
    when: 12.3,
    durationMs: 400,
  });

  s.drain(10, 1 / 60);
  expect(built[0].id).toBe('auto_1_2.5_A2');
  expect(built[0].noteName).toBe('A2');
  expect(built[0].midiOverride).toBe(45);
  expect(built[0].when).toBe(12.3);
  expect(built[0].durationMs).toBe(400);
});

test('clear drops unbuilt voices without building them', () => {
  const built: AutoVoiceEntry[] = [];
  const s = new AutoVoiceScheduler((e) => built.push(e));
  s.enqueue(makeEntry('v0', 100.2));
  s.enqueue(makeEntry('v1', 100.3));
  s.drain(100, 1 / 60);
  expect(built).toHaveLength(1);

  s.clear();
  expect(s.pending).toBe(0);
  s.drain(100.5, 1 / 60);
  expect(built).toHaveLength(1);
});

test('slow frames build proportionally more voices per frame', () => {
  const built: AutoVoiceEntry[] = [];
  const s = new AutoVoiceScheduler((e) => built.push(e));
  for (let i = 0; i < 20; i++) s.enqueue(makeEntry(`v${i}`, 100.2));

  s.drain(100, 1 / 30); // 30fps machine: budget = ceil(20 * 0.033 / 0.2) = 4
  expect(s.builtThisFrame).toBe(4);

  const fast = new AutoVoiceScheduler((e) => built.push(e));
  for (let i = 0; i < 20; i++) fast.enqueue(makeEntry(`v${i}`, 100.2));
  fast.drain(100, 1 / 120); // 120fps: budget = ceil(20 * 0.0083 / 0.2) = 1
  expect(fast.builtThisFrame).toBe(1);
});
