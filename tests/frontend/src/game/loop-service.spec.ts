import { test, expect } from 'bun:test';
import { LoopService } from '../../../../frontend/src/game/LoopService.ts';

test('loop chain reflects every mutation', () => {
  const svc = new LoopService();
  const a = { id: 1, startTime: 5, endTime: 10, enabled: true, name: null };
  const b = { id: 2, startTime: 0, endTime: 4, enabled: false, name: null };

  svc.setLoops([a, b]);
  expect(svc.chain).toEqual([a]);

  b.enabled = true;
  svc.updateLoop(2, { enabled: true });
  expect(svc.chain.map((l) => l.id)).toEqual([2, 1]);
  expect(svc.chain).toBe(svc.chain);

  svc.updateLoop(1, { endTime: 12 });
  expect(svc.chain.find((l) => l.id === 1)!.endTime).toBe(12);

  svc.addLoop({ id: 3, startTime: 20, endTime: 25, enabled: true, name: 'Solo' });
  expect(svc.chain.map((l) => l.id)).toEqual([2, 1, 3]);

  svc.remove(1);
  expect(svc.chain.map((l) => l.id)).toEqual([2, 3]);

  svc.clear();
  expect(svc.chain).toEqual([]);
});

// -- saved-set order -----------------------------------------------------------

test('saved set stays ordered by startTime across setLoops and addLoop', () => {
  const svc = new LoopService();
  svc.addLoop({ id: 1, startTime: 5, endTime: 8, enabled: true, name: null });
  svc.addLoop({ id: 2, startTime: 0, endTime: 2, enabled: true, name: null });
  svc.addLoop({ id: 3, startTime: 10, endTime: 12, enabled: false, name: null });
  expect(svc.loops.map((l) => l.id)).toEqual([2, 1, 3]);

  svc.setLoops([
    { id: 4, startTime: 9, endTime: 11, enabled: true, name: null },
    { id: 5, startTime: 2, endTime: 4, enabled: true, name: null },
  ]);
  expect(svc.loops.map((l) => l.id)).toEqual([5, 4]);
});

test('addLoop lands a new loop after existing loops with equal startTime', () => {
  const svc = new LoopService();
  svc.addLoop({ id: 1, startTime: 4, endTime: 6, enabled: true, name: null });
  svc.addLoop({ id: 2, startTime: 4, endTime: 8, enabled: true, name: null });
  expect(svc.loops.map((l) => l.id)).toEqual([1, 2]);
});

// -- updates: updateLoop -------------------------------------------------------

test('updateLoop applies whitelisted fields without touching the chain identity', () => {
  const svc = new LoopService();
  svc.setLoops([
    { id: 1, startTime: 0, endTime: 4, enabled: true, name: null },
    { id: 2, startTime: 5, endTime: 9, enabled: true, name: 'first' },
  ]);
  const chainBefore = svc.chain;

  svc.updateLoop(1, { name: 'intro', endTime: 5 });
  expect(svc.loops.find((l) => l.id === 1)).toMatchObject({ name: 'intro', endTime: 5 });

  svc.updateLoop(2, { name: null });
  expect(svc.loops.find((l) => l.id === 2)!.name).toBeNull();

  // Each rebuild makes a fresh chain array, but the entries are the same
  // objects, so the rename is visible through both set views.
  expect(svc.chain).not.toBe(chainBefore);
  expect(svc.chain.map((l) => l.id)).toEqual(chainBefore.map((l) => l.id));
  expect(svc.chain[0].name).toBe('intro');
});

test('updateLoop ignores unknown fields and unknown ids', () => {
  const svc = new LoopService();
  svc.addLoop({ id: 1, startTime: 0, endTime: 2, enabled: true, name: 'x' });

  // startTime/id are not updatable: they never appear in LoopUpdates.
  svc.updateLoop(1, { enabled: false, endTime: 6 });
  expect(svc.loops[0]).toEqual({
    id: 1,
    startTime: 0,
    endTime: 6,
    enabled: false,
    name: 'x',
  });

  svc.updateLoop(99, { enabled: true, name: 'y' });
  expect(svc.loops).toHaveLength(1);
  expect(svc.loops[0]).toEqual({
    id: 1,
    startTime: 0,
    endTime: 6,
    enabled: false,
    name: 'x',
  });
});

test('updateLoop with name only keeps the engaged chain active', () => {
  const svc = new LoopService();
  svc.setLoops([{ id: 1, startTime: 0, endTime: 4, enabled: true, name: null }]);
  svc.engage();
  expect(svc.active).toBe(true);

  svc.updateLoop(1, { name: 'chorus' });
  expect(svc.active).toBe(true);
  expect(svc.current!.name).toBe('chorus');
});

test('displayName falls back to a 1-based positional label for unnamed loops', () => {
  const svc = new LoopService();
  svc.setLoops([
    { id: 2, startTime: 5, endTime: 9, enabled: true, name: null },
    { id: 1, startTime: 0, endTime: 4, enabled: true, name: 'intro' },
  ]);

  expect(svc.displayName(svc.loops[0])).toBe('intro');
  expect(svc.displayName(svc.loops[1])).toBe('Loop 2');
});

// -- extension bound: nextStartAfter ------------------------------------------

test('nextStartAfter returns the earliest loop starting later', () => {
  const svc = new LoopService();
  svc.setLoops([
    { id: 1, startTime: 5, endTime: 10, enabled: true, name: null },
    { id: 2, startTime: 0, endTime: 3, enabled: true, name: null },
    { id: 3, startTime: 12, endTime: 15, enabled: false, name: null },
  ]);

  expect(svc.nextStartAfter(0)).toBe(5);
  expect(svc.nextStartAfter(5)).toBe(12);
  expect(svc.nextStartAfter(12)).toBeNull();
});

test('nextStartAfter ignores loops that start at or before the given time', () => {
  const svc = new LoopService();
  svc.setLoops([
    { id: 1, startTime: 0, endTime: 20, enabled: true, name: null },
    { id: 2, startTime: 5, endTime: 8, enabled: true, name: null },
  ]);

  expect(svc.nextStartAfter(0)).toBe(5);
  expect(svc.nextStartAfter(5)).toBeNull();
});

test('nextStartAfter on an empty set is null', () => {
  const svc = new LoopService();
  expect(svc.nextStartAfter(0)).toBeNull();
});
