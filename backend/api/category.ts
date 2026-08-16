import { listCategories, createCategory } from "../models/index.ts";
import { json, parseJson, handleErr, type Handler } from "./router.ts";
import { requireAuth } from "./middleware.ts";

export const categoryRoutes = [
  {
    method: "GET",
    path: "/api/categories",
    handler: ((req: Request) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      return json(listCategories());
    }) as Handler,
  },
  {
    method: "POST",
    path: "/api/categories",
    handler: ((req: Request) => {
      const auth = requireAuth(req);
      if (auth instanceof Response) return auth;
      return parseJson<{ name?: string }>(req)
        .then(({ name }) => json(createCategory(name ?? ""), 201))
        .catch((err) => handleErr(err, 400));
    }) as Handler,
  },
];
