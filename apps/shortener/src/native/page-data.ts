import { createServerFn } from '@tanstack/react-start';
import type { ShortLinkPage } from '../link/resolve';

/** Reads the page model the Worker resolved for this SSR request. */
export const loadShortLinkPage = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ShortLinkPage> => {
    const { contextPage } = await import('./request-context');
    // A direct RPC call has no resolved slug and must not disclose a target.
    return contextPage() ?? { kind: 'not-found' };
  }
);
