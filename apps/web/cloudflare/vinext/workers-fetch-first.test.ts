import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  WORKERS_FETCH_INSTALL,
  workersFetchFirst,
} from './workers-fetch-first';

const transform = (code: string, id: string) => {
  const hook = workersFetchFirst().transform;
  if (typeof hook !== 'function') throw new Error('transform hook missing');
  return hook.call({} as never, code, id) as { code: string } | null;
};

describe('workersFetchFirst', () => {
  it('makes the vinext fetch-cache shim import the Workers fetch install', () => {
    const shim = '/repo/node_modules/vinext/dist/shims/fetch-cache.js';
    const result = transform('const originalFetch = globalThis.fetch;', shim);
    expect(result?.code.split('\n')[0]).toBe(
      `import ${JSON.stringify(WORKERS_FETCH_INSTALL)};`
    );
    expect(transform('x', `${shim}?v=1`)).not.toBeNull();
  });

  it('leaves every other module unchanged', () => {
    expect(
      transform(
        'x',
        '/repo/node_modules/vinext/dist/shims/fetch-cache-state.js'
      )
    ).toBeNull();
    expect(transform('x', '/repo/src/fetch-cache.js')).toBeNull();
  });

  it('runs in the vinext Worker build', () => {
    const config = readFileSync(
      new URL('../../vite.vinext.config.ts', import.meta.url),
      'utf8'
    );
    expect(config).toContain('workersFetchFirst()');
  });
});
