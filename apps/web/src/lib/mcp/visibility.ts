import { createInternalApiClient } from '@tuturuuu/internal-api/client';
import { z } from 'zod';
import type { McpActor, McpAuthority } from './contracts';
import { uuid } from './contracts';
import { createMcpReadFetch } from './internal-api';

const responseSchema = z
  .object({ hiddenWorkspaceIds: z.array(uuid).max(1000) })
  .strict();

// Workspace lane owner GET: HIDDEN_WORKSPACE, absent row means visible. No
// direct config query, admin fallback, cache or join into canonical membership.
// The helper can be replaced with that lane's typed internal-api export once
// integrated; this call already uses the existing shared internal-api client.
export function createMcpVisibilityReader(
  actor: McpActor,
  fetchImpl: typeof fetch = fetch
): McpAuthority['workspaceVisibility'] {
  const client = createInternalApiClient({
    baseUrl: 'https://tuturuuu.com',
    fetch: createMcpReadFetch(actor, fetchImpl),
  });
  return async (userId, workspaceId) => {
    if (userId !== actor.userId) return 'unknown';
    try {
      const data = responseSchema.parse(
        await client.json<unknown>('/api/v1/users/me/hidden-workspaces', {
          cache: 'no-store',
          query: { expectedActorId: actor.userId },
        })
      );
      return data.hiddenWorkspaceIds.includes(workspaceId)
        ? 'hidden'
        : 'visible';
    } catch {
      // Unavailable/unmerged owner route cannot be mistaken for an empty list.
      return 'unknown';
    }
  };
}
