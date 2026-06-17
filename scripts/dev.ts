import { spawn, spawnSync } from "bun";
import { cpSync, watch } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "frontend");
const DIST = join(ROOT, "dist");

const STATIC_ASSETS = ["index.html", "css", "assets"];

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

const serve = spawn(["bun", "x", "serve", DIST, "-p", "3000", "--no-clipboard"], {
  cwd: ROOT,
  stdio: ["ignore", "inherit", "inherit"],
});

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
  serve.kill();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

await Promise.all([tsc.exited, serve.exited]);
