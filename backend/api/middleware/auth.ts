import { validateSession, type AuthUser } from "../../models/auth.ts";
import { json, type Handler } from "../router.ts";

/** Extract Bearer token from Authorization header. */
function extractToken(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/** Require a valid auth token. Returns the authenticated user or
 *  sends a 401 Response. */
export function requireAuth(req: Request): AuthUser | Response {
  const token = extractToken(req);
  if (!token) {
    return json({ error: "Authentication required" }, 401);
  }
  const user = validateSession(token);
  if (!user) {
    return json({ error: "Invalid or expired token" }, 401);
  }
  return user;
}

/** Wrap a handler so it requires a valid auth token. The wrapped handler
 *  receives the authenticated user directly, skipping the manual
 *  `requireAuth` + `instanceof Response` dance. */
export function withAuth(
  handler: (req: Request, auth: AuthUser, params: Record<string, string>) => Promise<Response> | Response,
): Handler {
  return (req, params) => {
    const auth = requireAuth(req);

    if (auth instanceof Response) return auth;

    return handler(req, auth, params);
  };
}

/** User-or-null variant of `requireAuth`: routes open to guests treat
 *  "no user" as a valid state. */
export function optionalAuth(req: Request): AuthUser | null {
  const token = extractToken(req);
  if (!token) return null;
  return validateSession(token);
}

export function withOptionalAuth(
  handler: (req: Request, auth: AuthUser | null, params: Record<string, string>) => Promise<Response> | Response,
): Handler {
  return (req, params) => handler(req, optionalAuth(req), params);
}
