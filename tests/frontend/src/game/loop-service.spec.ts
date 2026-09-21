import { test, expect } from 'bun:test';
import { LoopDefinitionState } from '../../../../frontend/src/game/Loop.ts';
import { LoopService } from '../../../../frontend/src/game/LoopService.ts';

const loop = (id: number, startTime: number, endTime: number, enabled = true) => ({ id, startTime, endTime, enabled });

test('setBoundary collects start then end and lands a draft without engaging', () => {
  const ls = new LoopService();
  ls.beginDefine();
  expect(ls.setBoundary(2.0)).toBe(LoopDefinitionState.End);
  expect(ls.setBoundary(4.0)).toBe(LoopDefinitionState.Off);

  expect(ls.draftStart).toBe(2.0);
  expect(ls.draftEnd).toBe(4.0);
  expect(ls.hasDraft).toBe(true);
  expect(ls.active).toBe(false);
});

test('setBoundary swaps when the end precedes the start', () => {
  const ls = new LoopService();
  ls.beginDefine();
  ls.setBoundary(5.0);
  ls.setBoundary(1.0);

  expect(ls.draftStart).toBe(1.0);
  expect(ls.draftEnd).toBe(5.0);
  expect(ls.hasDraft).toBe(true);
});

test('cancelDraft aborts the draft', () => {
  const ls = new LoopService();
  ls.beginDefine();
  ls.setBoundary(2.0);
  ls.cancelDraft();

  expect(ls.hasDraft).toBe(false);
  expect(ls.definitionState).toBe(LoopDefinitionState.Off);
});

test('chain only holds enabled loops, sorted by start time', () => {
  const ls = new LoopService();
  ls.setLoops([loop(20, 7, 9, true), loop(10, 1, 3, true), loop(30, 5, 6, false)]);

  expect(ls.chain.map(l => l.id)).toEqual([10, 20]);
});

test('disengage keeps saved loops; clear removes them', () => {
  const ls = new LoopService();
  ls.setLoops([loop(1, 2, 5, true)]);
  expect(ls.engage()).toBe(true);
  expect(ls.active).toBe(true);

  ls.disengage();
  expect(ls.active).toBe(false);
  expect(ls.loops).toHaveLength(1);

  ls.clear();
  expect(ls.loops).toHaveLength(0);
});

test('engage returns false with zero enabled loops and leaves the chain idle', () => {
  const ls = new LoopService();
  ls.setLoops([loop(1, 0.5, 1.0, false)]);

  expect(ls.engage()).toBe(false);
  expect(ls.active).toBe(false);
  expect(ls.chain).toHaveLength(0);
  expect(ls.loops).toHaveLength(1);
});

test('advance walks the chain in order and wraps back to the first loop', () => {
  const ls = new LoopService();
  ls.setLoops([loop(10, 1, 3, true), loop(20, 7, 9, true)]);
  ls.engage();

  expect(ls.current!.id).toBe(10);
  expect(ls.advance()!.id).toBe(20);
  expect(ls.advance()!.id).toBe(10);
});
