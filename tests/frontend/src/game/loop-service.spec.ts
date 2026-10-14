import { test, expect } from 'bun:test';
import { LoopService } from '../../../../frontend/src/game/LoopService.ts';

test('loop chain reflects every mutation', () => {
  const svc = new LoopService();
  const a = { id: 1, startTime: 5, endTime: 10, enabled: true };
  const b = { id: 2, startTime: 0, endTime: 4, enabled: false };

  svc.setLoops([a, b]);
  expect(svc.chain).toEqual([a]);

  b.enabled = true;
  svc.setEnabled(2, true);
  expect(svc.chain.map((l) => l.id)).toEqual([2, 1]);
  expect(svc.chain).toBe(svc.chain);

  svc.setEndTime(1, 12);
  expect(svc.chain.find((l) => l.id === 1)!.endTime).toBe(12);

  svc.addLoop({ id: 3, startTime: 20, endTime: 25, enabled: true });
  expect(svc.chain.map((l) => l.id)).toEqual([2, 1, 3]);

  svc.remove(1);
  expect(svc.chain.map((l) => l.id)).toEqual([2, 3]);

  svc.clear();
  expect(svc.chain).toEqual([]);
});

// -- saved-set order -----------------------------------------------------------

test('saved set stays ordered by startTime across setLoops and addLoop', () => {
  const svc = new LoopService();
  svc.addLoop({ id: 1, startTime: 5, endTime: 8, enabled: true });
  svc.addLoop({ id: 2, startTime: 0, endTime: 2, enabled: true });
  svc.addLoop({ id: 3, startTime: 10, endTime: 12, enabled: false });
  expect(svc.loops.map((l) => l.id)).toEqual([2, 1, 3]);

  svc.setLoops([
    { id: 4, startTime: 9, endTime: 11, enabled: true },
    { id: 5, startTime: 2, endTime: 4, enabled: true },
  ]);
  expect(svc.loops.map((l) => l.id)).toEqual([5, 4]);
});

test('addLoop lands a new loop after existing loops with equal startTime', () => {
  const svc = new LoopService();
  svc.addLoop({ id: 1, startTime: 4, endTime: 6, enabled: true });
  svc.addLoop({ id: 2, startTime: 4, endTime: 8, enabled: true });
  expect(svc.loops.map((l) => l.id)).toEqual([1, 2]);
});

// -- extension bound: nextStartAfter ------------------------------------------

test('nextStartAfter returns the earliest loop starting later', () => {
  const svc = new LoopService();
  svc.setLoops([
    { id: 1, startTime: 5, endTime: 10, enabled: true },
    { id: 2, startTime: 0, endTime: 3, enabled: true },
    { id: 3, startTime: 12, endTime: 15, enabled: false },
  ]);

  expect(svc.nextStartAfter(0)).toBe(5);
  expect(svc.nextStartAfter(5)).toBe(12);
  expect(svc.nextStartAfter(12)).toBeNull();
});

test('nextStartAfter ignores loops that start at or before the given time', () => {
  const svc = new LoopService();
  svc.setLoops([
    { id: 1, startTime: 0, endTime: 20, enabled: true },
    { id: 2, startTime: 5, endTime: 8, enabled: true },
  ]);

  expect(svc.nextStartAfter(0)).toBe(5);
  expect(svc.nextStartAfter(5)).toBeNull();
});

test('nextStartAfter on an empty set is null', () => {
  const svc = new LoopService();
  expect(svc.nextStartAfter(0)).toBeNull();
});
