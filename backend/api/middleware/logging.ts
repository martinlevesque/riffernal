import { logger } from "../helpers/logger.ts";
import type { RequestHandler } from "./types.ts";

/** Log every request (timestamp, level, method, path, status, duration).
 *  /api/* requests log at info; static assets log at debug to keep
 *  dev-server output readable. 5xx responses always log at error. */
export function withRequestLogging(handler: RequestHandler): RequestHandler {
  return async (req) => {
    const start = performance.now();
    const res = await handler(req);
    const ms = Math.round(performance.now() - start);
    const path = new URL(req.url).pathname;
    const line = `${req.method} ${path} ${res.status} ${ms}ms`;

    if (res.status >= 500) {
      logger.error(line);
    } else if (path.startsWith("/api/")) {
      logger.info(line);
    } else {
      logger.debug(line);
    }

    return res;
  };
}
