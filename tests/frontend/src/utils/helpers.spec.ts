import { test, expect } from 'bun:test';
import { formatTime, formatTimePrecise } from '../../../../frontend/src/utils/helpers.ts';

test('formatTime pads seconds to two digits', () => {
  expect(formatTime(65)).toBe('1:05');
});

test('formatTime clamps preroll negative playback time to zero', () => {
  expect(formatTime(-0.5)).toBe('0:00');
});

test('formatTimePrecise shows minutes, padded seconds and milliseconds', () => {
  expect(formatTimePrecise(65.5)).toBe('1:05.500');
  expect(formatTimePrecise(0.007)).toBe('0:00.007');
});

test('formatTimePrecise carries rounded milliseconds and clamps negatives', () => {
  expect(formatTimePrecise(59.9996)).toBe('1:00.000');
  expect(formatTimePrecise(-1)).toBe('0:00.000');
});
