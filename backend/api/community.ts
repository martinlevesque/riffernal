import {
  listPublicCommunitySongs,
  setSongPublicCommunity,
  toggleCommunityBookmark,
  getCommunitySong,
} from "../models/index.ts";
import { json, parseJson, handleErr, notFound } from "./router.ts";
import { withAuth } from "./middleware.ts";

const DEFAULT_LIMIT = 10;

/** Parse and clamp the `limit`/`offset` query params from a request URL. */
function parsePagination(url: URL, defaultLimit = DEFAULT_LIMIT): { limit: number; offset: number } {
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || defaultLimit));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  return { limit, offset };
}

export const communityRoutes = [
  {
    method: "GET",
    path: "/api/community/songs",
    handler: withAuth((req, auth) => {
      const { limit, offset } = parsePagination(new URL(req.url));
      return json(listPublicCommunitySongs(auth.id, limit, offset));
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
