// This file is compiled inside the deployed route at request time. Keep the
// worker implementation as a physical monorepo-relative import so esbuild does
// not depend on workspace package symlinks that Vercel omits from the function.
import { createOfflineWorker } from '../../../../packages/offline/src/worker';

const worker = createOfflineWorker();
worker.addEventListeners();
