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
