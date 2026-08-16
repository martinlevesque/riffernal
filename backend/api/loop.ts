import {
  listLoops,
  createLoop,
  setLoopEnabled,
  setLoopEndTime,
  removeLoop,
  type Loop,
} from "../models/index.ts";
import { json, parseJson, handleErr, paramId, type Handler } from "./router.ts";
import { requireAuth } from "./middleware.ts";

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
    handler: ((req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      return parseJson<{ startTime: number; endTime: number; enabled?: boolean }>(req)
        .then((body) => {
          const songId = paramId(id);
          if (songId instanceof Response) return songId;
          if (typeof body.startTime !== "number" || typeof body.endTime !== "number") {
            return json({ error: "Invalid loop boundaries" }, 400);
          }
          try {
            const created = createLoop(auth.id, songId, body.startTime, body.endTime, body.enabled !== false);
            return json(created, 201);
          } catch (err) {
            return handleErr(err, 400);
          }
        })
        .catch(() => json({ error: "Invalid request" }, 400));
    }) as Handler,
  },
  {
    method: "PATCH",
    path: "/api/loops/:id",
    handler: ((req: Request, { id }: Record<string, string>) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      return parseJson<Record<string, unknown>>(req)
        .then((body) => {
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
            try {
              const updated = fn(auth.id, loopId, value as never);
              if (updated) { result = updated; applied = true; }
            } catch (err) {
              return handleErr(err, 400);
            }
          }

          if (!attempted) return json({ error: "No valid fields to update" }, 400);
          if (!applied) return json({ error: "Not found" }, 404);
          return json(result);
        })
        .catch(() => json({ error: "Invalid request" }, 400));
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
      return removed ? json({ ok: true }) : json({ error: "Not found" }, 404);
    }) as Handler,
  },
];
