import {
  needsSetup,
  setupAdmin,
  register as authRegister,
  login as authLogin,
  logout as authLogout,
} from "../models/auth.ts";
import { json, parseJson, type Handler } from "./router.ts";

export const authRoutes = [
  {
    method: "GET",
    path: "/api/auth/setup",
    handler: (() => json({ needed: needsSetup() })) as Handler,
  },
  {
    method: "POST",
    path: "/api/auth/setup",
    handler: (async (req: Request) => {
      const body = await parseJson<{ username: string; tagline?: string; password: string }>(req);
      const result = await setupAdmin(body.username, body.tagline ?? "", body.password);

      return json(result, 201);
    }) as Handler,
  },
  {
    method: "POST",
    path: "/api/auth/register",
    handler: (async (req: Request) => {
      const body = await parseJson<{ username: string; tagline?: string; password: string }>(req);
      const user = await authRegister(body.username, body.tagline ?? "", body.password);

      return json(user, 201);
    }) as Handler,
  },
  {
    method: "POST",
    path: "/api/auth/login",
    handler: (async (req: Request) => {
      const body = await parseJson<{ username: string; password: string }>(req);
      const result = await authLogin(body.username, body.password);

      return json(result);
    }) as Handler,
  },
  {
    method: "POST",
    path: "/api/auth/logout",
    handler: ((req: Request) => {
      const auth = req.headers.get("Authorization");

      if (auth?.startsWith("Bearer ")) {
        authLogout(auth.slice(7));
      }

      return json({ ok: true });
    }) as Handler,
  },
];
