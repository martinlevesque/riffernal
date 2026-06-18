import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");

if (!existsSync(DIST)) {
  console.error(`dist/ not found. Run "bun run build" first.`);
  process.exit(1);
}

const serve = Bun.spawn(["bun", "x", "serve", DIST, "-p", "3000", "--no-clipboard"], {
  cwd: ROOT,
  stdio: ["ignore", "inherit", "inherit"],
});

await serve.exited;
