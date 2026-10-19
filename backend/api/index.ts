import { defineRoutes, json, type Route, handleErr } from "./router.ts";
import { maybeCompress } from "./helpers/compression.ts";
import { errDetails, logger } from "./helpers/logger.ts";
import { DomainError } from "../models/validation.ts";
import { categoryRoutes } from "./category.ts";
import { songRoutes } from "./song.ts";
import { communityRoutes } from "./community.ts";
import { userRoutes } from "./user.ts";
import { loopRoutes } from "./loop.ts";
import { authRoutes } from "./auth.ts";
import { statusRoutes } from "./status.ts";
import { leaderboardRoutes } from "./leaderboard.ts";
import { withRateLimit } from "./middleware/rateLimit.ts";

const routes: Route[] = defineRoutes([
  ...statusRoutes,
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
async function dispatchApi(req: Request, pathname: string): Promise<Response | null> {
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
      const result = await route.handler(req, params);
      return await maybeCompress(req, result);
    } catch (err) {
      if (err instanceof DomainError) {
        return await maybeCompress(req, json({ error: err.message }, err.status));
      }

      logger.error(`${req.method} ${pathname} failed: ${errDetails(err)}`);
      return await maybeCompress(req, handleErr(err));
    }
  }
  return null;
}

export const handleApi = withRateLimit(dispatchApi);
