// @vitest-environment node
import { expect, it, vi } from 'vitest';

// The native Apps vitest config does not inline next-intl, whose middleware
// imports `next/server` without an extension. Stub only that framework
// factory: the test is about this proxy's own module-scope code.
vi.mock('next-intl/middleware', () => ({
  default: () => () => undefined,
}));

// Fails if the proxy throws while loading (for example a top-level reference to
// an identifier a merge removed), which a type check on a stale base can miss.
it('loads the proxy module with its handler and matcher', async () => {
  const module = await import('../proxy');
  expect(typeof module.proxy).toBe('function');
  expect(module.config?.matcher).toBeTruthy();
});
