import { listGuestShowcaseSongs, getGuestShowcaseSong } from "../models/index.ts";
import { json, paramId, notFound, type Handler } from "./router.ts";

export const guestRoutes = [
  {
    method: "GET",
    path: "/api/guest/showcase",
    handler: (() => {
      return json({ songs: listGuestShowcaseSongs() });
    }) as Handler,
  },
  {
    method: "GET",
    path: "/api/guest/showcase/:id",
    handler: ((_req: Request, { id }: Record<string, string>) => {
      const songId = paramId(id);
      if (songId instanceof Response) return songId;
      const song = getGuestShowcaseSong(songId);
      return song ? json(song) : notFound();
    }) as Handler,
  },
];
