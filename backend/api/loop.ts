import {
  listLoops,
  createLoop,
  setLoopEnabled,
  setLoopEndTime,
  removeLoop,
  type Loop,
} from "../models/index.ts";
import { json, parseJson, paramId, notFound, type Handler } from "./router.ts";
import { requireAuth } from "./middleware/index.ts";

export const loopRoutes = [
  {
    method: "GET",
    path: "/api/songs/:id/loops",
    handler: ((req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;

      const songId = paramId(id);
      if (songId instanceof Response) return songId;

      return json(listLoops(auth.id, songId));
    }) as Handler,
  },
  {
    method: "POST",
    path: "/api/songs/:id/loops",
    handler: (async (req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const body = await parseJson<{ startTime: number; endTime: number; enabled?: boolean }>(req);
      const songId = paramId(id);
      if (songId instanceof Response) return songId;
      const created = createLoop(auth.id, songId, body.startTime, body.endTime, body.enabled !== false);
      return json(created, 201);
    }) as Handler,
  },
  {
    method: "PATCH",
    path: "/api/loops/:id",
    handler: (async (req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const body = await parseJson<Record<string, unknown>>(req);
      const loopId = paramId(id);
      if (loopId instanceof Response) return loopId;

      type Updater = (userId: number, loopId: number, value: never) => Loop | null;
      const up: Record<string, [Updater, (v: unknown) => boolean]> = {
        enabled: [setLoopEnabled as Updater, (v): v is boolean => typeof v === "boolean"],
        endTime: [setLoopEndTime as Updater, (v): v is number => typeof v === "number"],
      };

      let result: Loop | null = null;
      let applied = false;
      let attempted = false;

      for (const [key, value] of Object.entries(body)) {
        const entry = up[key];
        if (!entry) continue;
        const [fn, guard] = entry;
        if (!guard(value)) continue;
        attempted = true;
        const updated = fn(auth.id, loopId, value as never);
        if (updated) { result = updated; applied = true; }
      }

      if (!attempted) return json({ error: "No valid fields to update" }, 400);
      if (!applied) return notFound();
      return json(result);
    }) as Handler,
  },
  {
    method: "DELETE",
    path: "/api/loops/:id",
    handler: ((req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      const loopId = paramId(id);
      if (loopId instanceof Response) return loopId;
      const removed = removeLoop(auth.id, loopId);
      return removed ? json({ ok: true }) : notFound();
    }) as Handler,
  },
];
