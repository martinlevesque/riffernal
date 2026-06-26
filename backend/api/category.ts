import { getAllCategories, createCategory } from "../db.ts";
import { json, parseJson, errMsg, type Handler } from "./router.ts";

export const categoryRoutes = [
  {
    method: "GET",
    path: "/api/categories",
    handler: (() => json(getAllCategories())) as Handler,
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
