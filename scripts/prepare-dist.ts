import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const SRC = join(ROOT, 'frontend');
const DIST = join(ROOT, 'dist');

const STATIC_ASSETS = ['index.html', 'terms.html', 'privacy.html', 'css', 'assets'];

/** Drop stale build output from dist/js so the dev server's on-the-fly
 *  /js/*.js transpiler serves current source instead of a stale build. */
export function resetTranspiledJs(): void {
  const distJs = join(DIST, 'js');
  if (existsSync(distJs)) rmSync(distJs, { recursive: true, force: true });
}

export function copyStaticAssets(): void {
  if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

  for (const item of STATIC_ASSETS) {
    cpSync(join(SRC, item), join(DIST, item), { recursive: true });
  }
}

/** Top-level asset folders whose changes trigger a re-copy while dev watches. */
export { STATIC_ASSETS };
