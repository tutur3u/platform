// @vitest-environment node
import { expect, it } from 'vitest';

it('loads the proxy module with its handler and matcher', async () => {
  const module = await import('./proxy');
  expect(typeof module.proxy).toBe('function');
  expect(module.config?.matcher).toBeTruthy();
});
