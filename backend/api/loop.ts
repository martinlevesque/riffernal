import {
  listLoops,
  createLoop,
  setLoopEnabled,
  removeLoop,
} from "../models/index.ts";
import { json, parseJson, errMsg, paramId, type Handler } from "./router.ts";

export const loopRoutes = [
  {
    method: "GET",
    path: "/api/songs/:id/loops",
    handler: ((_req: Request, { id }: Record<string, string>) => {
      const songId = paramId(id);
      if (songId instanceof Response) return songId;
      return json(listLoops(songId));
    }) as Handler,
  },
  {
    method: "POST",
    path: "/api/songs/:id/loops",
    handler: ((req: Request, { id }: Record<string, string>) =>
      parseJson<{ startTime: number; endTime: number; enabled?: boolean }>(req)
        .then((body) => {
          const songId = paramId(id);
          if (songId instanceof Response) return songId;
          if (typeof body.startTime !== "number" || typeof body.endTime !== "number") {
            return json({ error: "Invalid loop boundaries" }, 400);
          }
          try {
            const created = createLoop(songId, body.startTime, body.endTime, body.enabled !== false);
            return json(created, 201);
          } catch (err) {
            return json({ error: errMsg(err) }, 400);
          }
        })
        .catch(() => json({ error: "Invalid request" }, 400))) as Handler,
  },
  {
    method: "PATCH",
    path: "/api/loops/:id",
    handler: ((req: Request, { id }: Record<string, string>) =>
      parseJson<{ enabled: boolean }>(req)
        .then((body) => {
          const loopId = paramId(id);
          if (loopId instanceof Response) return loopId;
          if (typeof body.enabled !== "boolean") {
            return json({ error: "Invalid enabled flag" }, 400);
          }
          const updated = setLoopEnabled(loopId, body.enabled);
          return updated ? json(updated) : json({ error: "Not found" }, 404);
        })
        .catch(() => json({ error: "Invalid request" }, 400))) as Handler,
  },
  {
    method: "DELETE",
    path: "/api/loops/:id",
    handler: ((_req: Request, { id }: Record<string, string>) => {
      const loopId = paramId(id);
      if (loopId instanceof Response) return loopId;
      const removed = removeLoop(loopId);
      return removed ? json({ ok: true }) : json({ error: "Not found" }, 404);
    }) as Handler,
  },
];
