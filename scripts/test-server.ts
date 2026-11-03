import { startServer } from './https-serve.ts';
import { copyStaticAssets, resetTranspiledJs } from './prepare-dist.ts';

// Playwright webServer entry point: dev.ts minus the file watcher, kept
// separate so nothing tied to the dev server can affect a test server.
resetTranspiledJs();
copyStaticAssets();

startServer(true);
