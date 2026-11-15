// @vitest-environment node
import { expect, it } from 'vitest';

// Fails if the proxy throws while loading (for example a top-level reference to
// an identifier a merge removed), which a type check on a stale base can miss.
it('loads the proxy module with its handler and matcher', async () => {
  const module = await import('./proxy');
  expect(typeof module.proxy).toBe('function');
  expect(module.config?.matcher).toBeTruthy();
});
