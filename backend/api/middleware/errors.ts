import { errDetails, logger } from "../helpers/logger.ts";
import { json } from "../router.ts";
import type { RequestHandler } from "./types.ts";

/** Last-resort catch-all: log the stack and return a generic 500 so an
 *  unhandled error never escapes the fetch handler. */
export function withErrorHandling(handler: RequestHandler): RequestHandler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      logger.error(`Unhandled error: ${errDetails(err)}`);
      return json({ error: "Internal server error" }, 500);
    }
  };
}
