import { getUserGameSettings, updateUserGameSettings, type GameSettings } from "../db.ts";
import { json, parseJson, type Handler } from "./router.ts";

export const userRoutes = [
  {
    method: "GET",
    path: "/api/user",
    handler: (() => {
      const settings = getUserGameSettings();
      return json(settings);
    }) as Handler,
  },
  {
    method: "PUT",
    path: "/api/user/settings",
    handler: ((req: Request) =>
      parseJson<Partial<GameSettings>>(req)
        .then((body) => {
          updateUserGameSettings(body);
          const settings = getUserGameSettings();
          return json(settings);
        })
        .catch(() => json({ error: "Invalid request" }, 400))) as Handler,
  },
];
