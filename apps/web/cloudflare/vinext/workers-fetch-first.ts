import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

// vinext's fetch-cache shim captures the global fetch under ORIGINAL_FETCH
// when it evaluates. The bundler inlines the Worker entry's side-effect
// imports into the entry chunk, whose body runs after every chunk it imports,
// so an import in the entry cannot run first. Importing the install module
// from the shim itself makes ESM dependency order run it before the capture.
export const WORKERS_FETCH_INSTALL = fileURLToPath(
  new URL('./install-workers-fetch.ts', import.meta.url)
);
const FETCH_CACHE_SHIM = /[\\/]vinext[\\/]dist[\\/]shims[\\/]fetch-cache\.js$/u;

export function workersFetchFirst(): Plugin {
  return {
    name: 'tuturuuu:workers-fetch-first',
    enforce: 'pre',
    transform(code, id) {
      if (!FETCH_CACHE_SHIM.test(id.replace(/\?.*$/u, ''))) return null;
      return {
        code: `import ${JSON.stringify(WORKERS_FETCH_INSTALL)};\n${code}`,
        map: null,
      };
    },
  };
}
