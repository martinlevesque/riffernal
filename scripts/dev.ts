import { spawn, spawnSync } from "bun";
import { cpSync, watch } from "node:fs";
import { join } from "node:path";
import { startServer } from "./https-serve.ts";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "frontend");
const DIST = join(ROOT, "dist");

const STATIC_ASSETS = ["index.html", "css", "assets"];
const httpOnly = process.argv.includes("--http");

const build = spawnSync(["bun", "run", join(ROOT, "scripts", "build.ts")], {
  cwd: ROOT,
  stdio: ["ignore", "inherit", "inherit"],
});

if (build.exitCode !== 0) {
  console.error("Initial build failed");
  process.exit(1);
}

const tsc = spawn(["bun", "x", "tsc", "--project", join(ROOT, "tsconfig.build.json"), "--watch"], {
  cwd: ROOT,
  stdio: ["ignore", "inherit", "inherit"],
});

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

const cleanup = () => {
  tsc.kill();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

await tsc.exited;
