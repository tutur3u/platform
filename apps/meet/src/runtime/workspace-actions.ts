import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

// The Start client sends no content type for a POST without data, which the
// native function boundary rejects; the empty object body keeps it JSON.
const listWorkspacesTransport = createServerFn({ method: 'POST' })
  .validator(z.object({}))
  .handler(async () => {
    const { listWorkspaces, withForwardedInternalApiAuth } =
      await import('@tuturuuu/internal-api');
    const { headers } = await import('./request-context');
    return listWorkspaces(withForwardedInternalApiAuth(await headers()));
  });

export const fetchWorkspaces = () => listWorkspacesTransport({ data: {} });
