import { defineRoutes, json, type Route, handleErr } from "./router.ts";
import { DomainError } from "../models/validation.ts";
import { categoryRoutes } from "./category.ts";
import { songRoutes } from "./song.ts";
import { communityRoutes } from "./community.ts";
import { userRoutes } from "./user.ts";
import { loopRoutes } from "./loop.ts";
import { authRoutes } from "./auth.ts";
import { leaderboardRoutes } from "./leaderboard.ts";

const routes: Route[] = defineRoutes([
  ...authRoutes,
  ...categoryRoutes,
  ...songRoutes,
  ...communityRoutes,
  ...userRoutes,
  ...loopRoutes,
  ...leaderboardRoutes,
]);

/** Handle an API request. Returns a Response, or null if no route matched.
 *  Catches `DomainError` thrown by model-layer validators/domain rules and
 *  maps it to the error's own `status`, so controllers don't need to wrap
 *  every call in try/catch just for status-code mapping. Non-domain errors
 *  fall through to `handleErr` (generic 500 unless message-matched). */
export async function handleApi(req: Request, pathname: string): Promise<Response | null> {
  for (const route of routes) {
    if (route.method !== req.method) {
      continue;
    }

    const match = route.pattern.exec(pathname);

    if (!match) {
      continue;
    }

    const params: Record<string, string> = {};
    route.keys.forEach((key, i) => {
      params[key] = match[i + 1];
    });
    try {
      return await route.handler(req, params);
    } catch (err) {
      if (err instanceof DomainError) {
        return json({ error: err.message }, err.status);
      }
      return handleErr(err);
    }
  }
  return null;
}
