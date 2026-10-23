import {
  listPublicCommunitySongs,
  setSongPublicCommunity,
  toggleCommunityBookmark,
  getCommunitySong,
} from "../models/index.ts";
import { json, parseJson, handleErr, notFound } from "./router.ts";
import { withAuth, withOptionalAuth } from "./middleware/index.ts";
import { parsePagination } from "./helpers/pagination.ts";

export const communityRoutes = [
  {
    method: "GET",
    path: "/api/community/songs",
    // Open to guests; playing a listed song still requires auth via
    // /api/community/songs/:id below.
    handler: withOptionalAuth((req, auth) => {
      const { limit, offset } = parsePagination(new URL(req.url));
      return json(listPublicCommunitySongs(auth?.id ?? null, limit, offset));
    }),
  },
  {
    method: "GET",
    path: "/api/community/songs/:id",
    handler: withAuth((_req, auth, { id }) => {
      const song = getCommunitySong(Number(id), auth.id);
      return song ? json(song) : notFound();
    }),
  },
  {
    method: "PUT",
    path: "/api/songs/:id/public-community",
    handler: withAuth(async (_req, auth, { id }) => {
      const { publicCommunity } = await parseJson<{ publicCommunity: boolean }>(_req);

      try {
        const updated = setSongPublicCommunity(Number(id), auth.id, publicCommunity);
        return updated ? json(updated) : notFound();
      } catch (err) {
        return handleErr(err);
      }
    }),
  },
  {
    method: "PUT",
    path: "/api/songs/:id/community-bookmark",
    handler: withAuth(async (_req, auth, { id }) => {
      const { communityBookmarked } = await parseJson<{ communityBookmarked: boolean }>(_req);
      const ok = toggleCommunityBookmark(Number(id), auth.id, communityBookmarked);
      return ok ? json({ ok: true }) : notFound();
    }),
  },
];
