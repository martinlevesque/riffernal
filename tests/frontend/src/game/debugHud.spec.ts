import { test, expect } from 'bun:test';
import { DebugStatsTracker, type DebugFrameStats } from '../../../../frontend/src/game/debugHud.js';

const makeStats = (over: Partial<DebugFrameStats> = {}): DebugFrameStats => ({
  frameDeltaSec: 1 / 60,
  workMs: 1,
  audioNow: 10,
  wallNow: 100,
  currentTime: 5,
  speedMultiplier: 1,
  voices: 4,
  backgroundVoices: 2,
  pendingBuilds: 0,
  totalBuilds: 10,
  ...over,
});

test('first update seeds anchors and reports zero drift/builds', () => {
  const t = new DebugStatsTracker();
  const lines = t.update(makeStats());

  expect(t.fps).toBe(60);
  expect(t.driftMsPerSec).toBe(0);
  expect(t.buildsPerSec).toBe(0);
  expect(lines.some((l) => l.includes('voices 4 (bg 2)'))).toBe(true);
});

test('drift is positive when wall time outgrows audio time', () => {
  const t = new DebugStatsTracker();
  t.update(makeStats({ wallNow: 100, audioNow: 10, totalBuilds: 10 }));
  t.update(makeStats({ wallNow: 102.1, audioNow: 12.0, totalBuilds: 40 }));

  // wall +2.1s, audio +2.0s → (2.1 - 2.0) * 1000 / 2.1 ≈ 47.62ms/s
  expect(t.driftMsPerSec).toBeCloseTo(47.62, 1);
  // Integer-rounded: (40 - 10) builds / 2.1s
  expect(t.buildsPerSec).toBe(14);
});

test('drift stays zero while the audio clock tracks wall time', () => {
  const t = new DebugStatsTracker();
  t.update(makeStats({ wallNow: 100, audioNow: 10 }));
  t.update(makeStats({ wallNow: 102.0, audioNow: 12.0 }));

  expect(t.driftMsPerSec).toBe(0);
});

test('negative drift renders with the minus sign', () => {
  const t = new DebugStatsTracker();
  t.update(makeStats({ wallNow: 100, audioNow: 10 }));
  const lines = t.update(makeStats({ wallNow: 102.0, audioNow: 12.5 }));

  // Audio outgrew wall by 0.5s over 2s → -250ms/s
  expect(t.driftMsPerSec).toBe(-250);
  expect(lines.some((l) => l.includes('audio drift -250'))).toBe(true);
});

test('frame stats roll over the 60-frame window and track maxima', () => {
  const t = new DebugStatsTracker();
  for (let i = 0; i < 100; i++) {
    t.update(makeStats({ frameDeltaSec: i < 90 ? 1 / 60 : 1 / 10, workMs: i === 99 ? 40 : 2 }));
  }

  // Window holds the last 60 samples: 50×60fps + 10×100ms → ~33fps.
  expect(t.fps).toBe(33);
  expect(t.maxWorkMs).toBe(40);
  expect(t.maxFrameMs).toBe(100);
});

test('anchors reset after each drift window', () => {
  const t = new DebugStatsTracker();
  t.update(makeStats({ wallNow: 100, audioNow: 10, totalBuilds: 10 }));
  t.update(makeStats({ wallNow: 102.0, audioNow: 12.0, totalBuilds: 40 }));
  expect(t.driftMsPerSec).toBe(0);

  // Next window starts at the 102s anchor: a sample just past it reports 0.
  t.update(makeStats({ wallNow: 102.5, audioNow: 12.5, totalBuilds: 41 }));
  expect(t.driftMsPerSec).toBe(0);
});
