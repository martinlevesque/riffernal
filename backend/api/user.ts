import { getGameSettings, updateGameSettings, type GameSettings } from "../models/index.ts";
import { json, parseJson, type Handler } from "./router.ts";

export const userRoutes = [
  {
    method: "GET",
    path: "/api/user",
    handler: (() => json(getGameSettings())) as Handler,
  },
  {
    method: "PUT",
    path: "/api/user/settings",
    handler: ((req: Request) =>
      parseJson<Partial<GameSettings>>(req)
        .then((body) => json(updateGameSettings(body)))
        .catch(() => json({ error: "Invalid request" }, 400))) as Handler,
  },
];