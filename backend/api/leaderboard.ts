import { getTodayLeaderboard } from "../models/index.ts";
import { json } from "./router.ts";
import { withAuth } from "./middleware/index.ts";

export const leaderboardRoutes = [
  {
    method: "GET",
    path: "/api/leaderboard",
    handler: withAuth(() => json(getTodayLeaderboard(10))),
  },
];
