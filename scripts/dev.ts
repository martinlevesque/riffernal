import { watch } from "node:fs";
import { join } from "node:path";
import { startServer } from "./https-serve.ts";
import { copyStaticAssets, resetTranspiledJs, STATIC_ASSETS } from "./prepare-dist.ts";

const SRC = join(import.meta.dir, "..", "frontend");

const httpOnly = process.argv.includes("--http");

resetTranspiledJs();
copyStaticAssets();
console.log("Static assets copied → dist/");

startServer(httpOnly);

let copyTimer: ReturnType<typeof setTimeout> | null = null;
watch(SRC, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const top = filename.split(/[\\/]/)[0];
  if (!top || !STATIC_ASSETS.includes(top)) return;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyStaticAssets();
    console.log("Static assets re-copied → dist/");
    copyTimer = null;
  }, 100);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
