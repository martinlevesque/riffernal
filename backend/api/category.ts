import { listCategories, createCategory } from "../models/index.ts";
import { json, parseJson, errMsg, type Handler } from "./router.ts";

export const categoryRoutes = [
  {
    method: "GET",
    path: "/api/categories",
    handler: (() => json(listCategories())) as Handler,
  },
  {
    method: "POST",
    path: "/api/categories",
    handler: ((req: Request) =>
      parseJson<{ name?: string }>(req)
        .then(({ name }) => json(createCategory(name ?? ""), 201))
        .catch((err) => json({ error: errMsg(err) }, 400))) as Handler,
  },
];