import { defineRoutes, type Route } from "./router.ts";
import { categoryRoutes } from "./category.ts";
import { songRoutes } from "./song.ts";
import { userRoutes } from "./user.ts";
import { loopRoutes } from "./loop.ts";
import { authRoutes } from "./auth.ts";

const routes: Route[] = defineRoutes([
  ...authRoutes,
  ...categoryRoutes,
  ...songRoutes,
  ...userRoutes,
  ...loopRoutes,
]);

/** Handle an API request. Returns a Response, or null if no route matched. */
export async function handleApi(req: Request, pathname: string): Promise<Response | null> {
  for (const route of routes) {
    if (route.method !== req.method) {
      continue;
    }

    const match = route.pattern.exec(pathname);

    if (!match) {
      continue;
    }

    const params: Record<string, string> = {};
    route.keys.forEach((key, i) => {
      params[key] = match[i + 1];
    });
    return route.handler(req, params);
  }
  return null;
}
