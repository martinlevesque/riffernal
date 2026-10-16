import {
  listLoops,
  createLoop,
  setLoopProperties,
  removeLoop,
  type LoopUpdates,
} from "../models/index.ts";
import { json, parseJson, paramId, notFound, type Handler } from "./router.ts";
import { requireAuth } from "./middleware/index.ts";
import { pickGuardedFields } from "./helpers/fields.ts";

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

      const updates = pickGuardedFields<LoopUpdates>(body, {
        enabled: (value): value is boolean => typeof value === "boolean",
        endTime: (value): value is number => typeof value === "number",
        name: (value): value is string | null => typeof value === "string" || value === null,
      });

      if (Object.keys(updates).length === 0) {
        return json({ error: "No valid fields to update" }, 400);
      }

      const updated = setLoopProperties(auth.id, loopId, updates);
      if (!updated) return notFound();
      return json(updated);
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
