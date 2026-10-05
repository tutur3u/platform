import { cache } from 'react';
import { getWorkspace } from './workspace-helper';

// React cache is scoped to a server render/request, never a shared authorization
// cache. Primitive actor keys let sibling layouts/pages reuse the same read.
const readWorkspace = cache(
  (
    id: string,
    useAdmin: boolean,
    actorId: string | null,
    email: string | null
  ) =>
    getWorkspace(id, {
      useAdmin,
      ...(actorId ? { user: { id: actorId, email } } : {}),
    })
);

export function getRequestWorkspace(
  id: string,
  options: Parameters<typeof getWorkspace>[1] = {}
) {
  return readWorkspace(
    id,
    options.useAdmin ?? false,
    options.user?.id ?? null,
    options.user?.email ?? null
  );
}
