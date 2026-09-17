import { test, expect } from 'bun:test';
import { Scoring, TIMING_OFFSET_DISPLAY_THRESHOLD_MS } from '../../../../frontend/src/game/scoring.ts';

test('recordOffset accumulates signed and absolute offsets', () => {
  const s = new Scoring();
  s.reset(10);
  s.recordOffset(-100);
  s.recordOffset(200);
  expect(s.getAverageOffsetMs()).toBe(150);
  expect(s.getOffsetDirection()).toBe('late');
});

test('getAverageOffsetMs rounds to the nearest millisecond', () => {
  const s = new Scoring();
  s.reset(10);
  s.recordOffset(10);
  s.recordOffset(15);
  expect(s.getAverageOffsetMs()).toBe(13);
});

test('getAverageOffsetMs returns 0 with no recorded offsets', () => {
  const s = new Scoring();
  s.reset(10);
  expect(s.getAverageOffsetMs()).toBe(0);
  expect(s.getOffsetDirection()).toBe('on time');
});

test('getOffsetDirection reports early, late, and mixed', () => {
  const late = new Scoring();
  late.reset(10);
  late.recordOffset(50);
  expect(late.getOffsetDirection()).toBe('late');

  const early = new Scoring();
  early.reset(10);
  early.recordOffset(-50);
  expect(early.getOffsetDirection()).toBe('early');

  const mixed = new Scoring();
  mixed.reset(10);
  mixed.recordOffset(50);
  mixed.recordOffset(-50);
  expect(mixed.getOffsetDirection()).toBe('mixed');
  expect(mixed.getAverageOffsetMs()).toBe(50);
});

test('recordOffset is skipped while scoring is disabled', () => {
  const s = new Scoring();
  s.reset(10);
  s.enabled = false;
  s.recordOffset(100);
  expect(s.getAverageOffsetMs()).toBe(0);
  expect(s.getOffsetDirection()).toBe('on time');
});

test('reset clears recorded offsets', () => {
  const s = new Scoring();
  s.recordOffset(100);
  s.reset(10);
  expect(s.getAverageOffsetMs()).toBe(0);
  expect(s.getOffsetDirection()).toBe('on time');
});

test('display threshold is 50ms', () => {
  expect(TIMING_OFFSET_DISPLAY_THRESHOLD_MS).toBe(50);
});
