import { createServerFn } from '@tanstack/react-start';

export const fetchWorkspaces = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { listWorkspaces, withForwardedInternalApiAuth } = await import(
      '@tuturuuu/internal-api'
    );
    const { headers } = await import('./request-context');
    return listWorkspaces(withForwardedInternalApiAuth(await headers()));
  }
);
