import { spawnSync } from "bun";
import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "frontend");
const DIST = join(ROOT, "dist");

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const tsc = spawnSync(["bun", "x", "tsc", "--project", join(ROOT, "tsconfig.build.json")], {
  cwd: ROOT,
  stdio: ["ignore", "inherit", "inherit"],
});

if (tsc.exitCode !== 0) {
  console.error("TypeScript compilation failed");
  process.exit(1);
}

for (const item of ["index.html", "css", "assets"]) {
  cpSync(join(SRC, item), join(DIST, item), { recursive: true });
}

console.log("Build complete → dist/");
