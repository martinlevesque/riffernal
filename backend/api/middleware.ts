import { validateSession, type AuthUser } from "../models/auth.ts";
import { json } from "./router.ts";

export interface AuthedRequest extends Request {
  authUser: AuthUser;
}

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
