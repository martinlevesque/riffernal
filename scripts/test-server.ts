import { startServer } from "./https-serve.ts";
import { copyStaticAssets, resetTranspiledJs } from "./prepare-dist.ts";

// Dedicated entry point for the Playwright webServer. Distinct from dev.ts
// on purpose: `bun run dev:stop` blanket-kills every scripts/dev.ts
// process, and concurrent test runs from other threads must survive that.
resetTranspiledJs();
copyStaticAssets();

startServer(true);
