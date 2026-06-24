import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "frontend", "src");
const DIST = join(ROOT, "dist");

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const transpiler = new Bun.Transpiler({ loader: "ts", target: "browser" });

function walkDir(dir: string, callback: (filePath: string, relPath: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else {
      callback(fullPath, fullPath.slice(SRC.length + 1));
    }
  }
}

walkDir(SRC, (fullPath, relPath) => {
  const outPath = join(DIST, "js", relPath.replace(/\.ts$/, ".js"));
  mkdirSync(join(outPath, ".."), { recursive: true });
  const code = readFileSync(fullPath, "utf-8");
  writeFileSync(outPath, transpiler.transformSync(code));
});

for (const item of ["index.html", "css", "assets"]) {
  cpSync(join(ROOT, "frontend", item), join(DIST, item), { recursive: true });
}

console.log("Build complete → dist/");