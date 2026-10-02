import { listWorkspaceCalendarEvents } from '@tuturuuu/internal-api/calendar';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import { listWorkspaces } from '@tuturuuu/internal-api/workspaces';
import { z } from 'zod';
import {
  McpAccessError,
  type McpActor,
  type McpReads,
  uuid,
} from './contracts';

const MAX_API_BYTES = 1_048_576;
const workspaceRows = z
  .array(z.object({ id: uuid, name: z.string(), access_type: z.string() }))
  .max(1000);
const taskRows = z
  .array(
    z.object({
      id: uuid,
      name: z.string(),
      is_personal_external: z.boolean().optional(),
      source_workspace_id: uuid.nullish(),
      task_lists: z.object({ workspace_boards: z.object({ ws_id: uuid }) }),
    })
  )
  .max(50);
const eventRows = z
  .array(
    z.object({
      id: uuid,
      title: z.string(),
      ws_id: uuid,
      start_at: z.iso.datetime({ offset: true }),
      end_at: z.iso.datetime({ offset: true }),
    })
  )
  .max(100);

async function boundedResponse(response: Response) {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_API_BYTES) {
        await reader.cancel();
        throw new McpAccessError(
          503,
          'API read exceeds the permitted response size.'
        );
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new Response(bytes, {
    status: response.status,
    headers: response.headers,
  });
}

// No CLI/config/session vault, arbitrary API method or service-role client.
// Requires a Supabase OAuth user JWT with the configured MCP audience, validated
// before construction. API auth compatibility and read-only RLS are release gates.
export function createMcpReadFetch(
  actor: McpActor,
  fetchImpl: typeof fetch = fetch
): typeof fetch {
  const requestFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname;
    const tasks =
      url.origin === 'https://tasks.tuturuuu.com' &&
      /^\/api\/v1\/workspaces\/[0-9a-f-]{36}\/tasks$/u.test(path);
    const calendar =
      url.origin === 'https://calendar.tuturuuu.com' &&
      /^\/api\/v1\/workspaces\/[0-9a-f-]{36}\/calendar\/events$/u.test(path);
    const workspaces =
      url.origin === 'https://tuturuuu.com' && path === '/api/v1/workspaces';
    const hidden =
      url.origin === 'https://tuturuuu.com' &&
      path === '/api/v1/users/me/hidden-workspaces' &&
      url.searchParams.size === 1 &&
      url.searchParams.get('expectedActorId') === actor.userId;
    if (
      method !== 'GET' ||
      url.username ||
      url.password ||
      !(tasks || calendar || workspaces || hidden)
    ) {
      throw new McpAccessError(
        403,
        'API request is outside the MCP read allowlist.'
      );
    }
    // Replace, never merge, auth/cookies from a caller. Redirects cannot carry JWTs.
    const response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${actor.providerAccessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new McpAccessError(
        response.status === 401 ? 401 : response.status === 403 ? 403 : 503,
        'Tuturuuu read is unavailable.'
      );
    }
    return boundedResponse(response);
  };
  return requestFetch;
}

export function createMcpApiReads(
  actor: McpActor,
  fetchImpl: typeof fetch = fetch
): McpReads {
  const requestFetch = createMcpReadFetch(actor, fetchImpl);
  const options = (baseUrl: string) => ({ baseUrl, fetch: requestFetch });
  return {
    async workspaces() {
      return workspaceRows.parse(
        await listWorkspaces(options('https://tuturuuu.com'))
      );
    },
    async tasks(workspaceId, limit, offset) {
      const result = await listWorkspaceTasks(
        workspaceId,
        {
          limit,
          offset,
          completed: 'exclude',
          closed: 'exclude',
          listStatuses: ['not_started', 'active'],
          includeRelationshipSummary: false,
        },
        options('https://tasks.tuturuuu.com')
      );
      const rows = taskRows.parse(result.tasks);
      if (
        rows.some(
          (row) =>
            row.task_lists.workspace_boards.ws_id !== workspaceId ||
            row.is_personal_external ||
            (row.source_workspace_id && row.source_workspace_id !== workspaceId)
        )
      ) {
        throw new McpAccessError(
          503,
          'Task response crossed the workspace boundary.'
        );
      }
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        workspace_id: workspaceId,
      }));
    },
    async calendar(workspaceId, start, end) {
      const result = await listWorkspaceCalendarEvents(
        workspaceId,
        { start_at: start, end_at: end },
        options('https://calendar.tuturuuu.com')
      );
      // Current API requires manage_calendar. This adapter does not weaken it.
      return eventRows.parse(result.data);
    },
  };
}
