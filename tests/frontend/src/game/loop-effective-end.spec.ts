import { test, expect } from 'bun:test';
import { NoteManager } from '../../../../frontend/src/game/NoteManager.ts';
import { LoopService } from '../../../../frontend/src/game/LoopService.ts';
import { makeSong } from '../../../helpers/song.js';

// NoteManager only reads the note fields these tests exercise; the SongData
// helper lacks TrackInfo extras that Song declares.
const load = (nm: NoteManager, notes: Array<{ time: number; key: string; duration: number }>): void => {
  nm.loadSong(makeSong(notes) as any);
};

test('getLoopEffectiveEnd returns the loop end with no notes up to it', () => {
  const nm = new NoteManager();
  load(nm, [{ time: 10.0, key: 'C3', duration: 0.5 }]);
  expect(nm.getLoopEffectiveEnd(5)).toBe(5);
});

test('getLoopEffectiveEnd follows a note ending past the loop end', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 2.0, key: 'C3', duration: 0.5 },
    { time: 4.0, key: 'E3', duration: 2.0 },
    { time: 8.0, key: 'G3', duration: 0.5 },
  ]);
  expect(nm.getLoopEffectiveEnd(5.5)).toBe(6.0);
  expect(nm.getLoopEffectiveEnd(3.0)).toBe(3.0);
});

test('getLoopEffectiveEnd follows a long note past the loop end', () => {
  const nm = new NoteManager();
  load(nm, [
    { time: 2.0, key: 'C3', duration: 10.0 },
    { time: 12.0, key: 'E3', duration: 0.25 },
  ]);
  expect(nm.getLoopEffectiveEnd(4.0)).toBe(12.0);
});

test('getLoopEffectiveEnd returns the end for an empty song', () => {
  const nm = new NoteManager();
  load(nm, []);
  expect(nm.getLoopEffectiveEnd(3)).toBe(3);
});

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
