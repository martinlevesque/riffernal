import { getGameSettings, updateGameSettings, deleteUserAccount, type GameSettings } from "../models/index.ts";
import { json, parseJson, type Handler } from "./router.ts";
import { requireAuth } from "./middleware/index.ts";

export const userRoutes = [
  {
    method: "GET",
    path: "/api/user",
    handler: ((req: Request) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      return json(getGameSettings(auth.id));
    }) as Handler,
  },
  {
    method: "PUT",
    path: "/api/user/settings",
    handler: ((req: Request) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      return parseJson<Partial<GameSettings>>(req)
        .then((body) => json(updateGameSettings(auth.id, body)))
        .catch(() => json({ error: "Invalid request" }, 400));
    }) as Handler,
  },
  {
    method: "DELETE",
    path: "/api/user",
    handler: ((req: Request) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      return json(deleteUserAccount(auth.id));
    }) as Handler,
  },
];