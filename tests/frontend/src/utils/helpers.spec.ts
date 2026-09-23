import { test, expect } from 'bun:test';
import { formatTime } from '../../../../frontend/src/utils/helpers.ts';

test('formatTime pads seconds to two digits', () => {
  expect(formatTime(65)).toBe('1:05');
});

test('formatTime clamps preroll negative playback time to zero', () => {
  expect(formatTime(-0.5)).toBe('0:00');
});
