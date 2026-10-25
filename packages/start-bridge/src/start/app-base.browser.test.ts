import { expect, it, vi } from 'vitest';

const STORE = Symbol.for('tuturuuu.start-bridge.request-context');
const BASE = '__tuturuuuAppBase';

// A cold browser: the document head script set the mount as a string and no
// server request store exists. Importing the bridge must not replace it.
it('keeps the head-script base in the browser and mounts owned APIs', async () => {
  const scope = globalThis as Record<string | symbol, unknown>;
  const saved = {
    store: scope[STORE],
    base: scope[BASE],
    window: scope.window,
  };
  delete scope[STORE];
  scope.window = {};
  scope[BASE] = '/finance';
  try {
    vi.resetModules();
    const { createAppBaseResolver } = await import('./app-base');
    // The client next/navigation shim's redirect helper imports the core too.
    await import('./absolute-redirect');
    const resolve = createAppBaseResolver(['/api/owned']);
    expect(resolve('/api/owned?x=1')).toBe('/finance/api/owned?x=1');
    expect(resolve('/api/web')).toBe('/api/web');
    expect(scope[BASE]).toBe('/finance');
  } finally {
    scope[STORE] = saved.store;
    scope[BASE] = saved.base;
    scope.window = saved.window;
    vi.resetModules();
  }
});
