import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "frontend", "src");
const DIST = join(ROOT, "dist");

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const entrypoint = join(SRC, "main.ts");
const result = await Bun.build({
  entrypoints: [entrypoint],
  outdir: join(DIST, "js"),
  target: "browser",
  format: "esm",
  minify: false,
});

if (!result.success) {
  for (const msg of result.logs) {
    console.error(msg);
  }
  process.exit(1);
}

const htmlSrc = join(ROOT, "frontend", "index.html");
const htmlDist = join(DIST, "index.html");
const html = readFileSync(htmlSrc, "utf-8");
const ts = Date.now().toString(36);
writeFileSync(htmlDist, html.replace('src="js/main.js"', `src="js/main.js?v=${ts}"`));

for (const item of ["css", "assets"]) {
  cpSync(join(ROOT, "frontend", item), join(DIST, item), { recursive: true });
}

console.log("Build complete → dist/");
