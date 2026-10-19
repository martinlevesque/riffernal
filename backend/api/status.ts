import { getStatus } from "../models/index.ts";
import { json, type Handler } from "./router.ts";

export const statusRoutes = [
  {
    method: "GET",
    path: "/api/status",
    handler: (() => {
      const report = getStatus();

      // 503 so an uptime pinger flags downtime when the db is unreachable.
      return json(report, report.status === "ok" ? 200 : 503);
    }) as Handler,
  },
];
