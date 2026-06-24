import { cpSync, existsSync, mkdirSync, rmSync, watch } from "node:fs";
import { join } from "node:path";
import { startServer } from "./https-serve.ts";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "frontend");
const DIST = join(ROOT, "dist");

const STATIC_ASSETS = ["index.html", "css", "assets"];
const httpOnly = process.argv.includes("--http");

// Ensure dist/ exists and copy static assets (JS is transpiled on the fly)
if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
// Remove stale compiled JS so dev always transpiles from source
const distJs = join(DIST, "js");
if (existsSync(distJs)) rmSync(distJs, { recursive: true, force: true });
for (const item of STATIC_ASSETS) {
  cpSync(join(SRC, item), join(DIST, item), { recursive: true });
}
console.log("Static assets copied → dist/");

startServer(httpOnly);

let copyTimer: ReturnType<typeof setTimeout> | null = null;
watch(SRC, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const top = filename.split(/[\\/]/)[0];
  if (!top || !STATIC_ASSETS.includes(top)) return;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    for (const item of STATIC_ASSETS) {
      cpSync(join(SRC, item), join(DIST, item), { recursive: true });
    }
    console.log("Static assets re-copied → dist/");
    copyTimer = null;
  }, 100);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));