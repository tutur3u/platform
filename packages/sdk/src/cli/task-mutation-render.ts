import type { TuturuuuUserClient } from '../platform';
import { render } from './render';
import {
  type getBlockerFlags,
  renderTaskFleetDetails,
  updateTaskBlockers,
} from './task-fleet-fields';

export async function renderTaskMutationResult({
  client,
  displayKey,
  fallback,
  group,
  json,
  taskId,
  workspaceId,
}: {
  client: TuturuuuUserClient;
  displayKey?: string;
  fallback: unknown;
  group: string;
  json: boolean;
  taskId: string;
  workspaceId: string;
}) {
  if (json) {
    render(fallback, { group, json });
    return;
  }

  try {
    render(
      withTaskDisplayKey(
        await client.tasks.get(workspaceId, taskId),
        displayKey
      ),
      {
        group,
        json,
      }
    );
  } catch {
    render(withTaskDisplayKey(fallback, displayKey), { group, json });
  }
}

export function getIdentifierDisplayKey(identifier?: string) {
  const value = identifier?.trim();
  return value && /^[a-z][a-z0-9]*-\d+$/i.test(value)
    ? value.toUpperCase()
    : undefined;
}

export function withTaskDisplayKey(data: unknown, displayKey?: string) {
  if (!displayKey || !data || typeof data !== 'object') return data;
  const record = data as { task?: unknown };
  if (!record.task || typeof record.task !== 'object') return data;
  return {
    ...record,
    task: {
      ...(record.task as Record<string, unknown>),
      display_key: displayKey,
    },
  };
}

export async function readTaskForFleetMutation(
  client: TuturuuuUserClient,
  workspaceId: string,
  taskId: string
) {
  try {
    return await client.tasks.get(workspaceId, taskId);
  } catch (cause) {
    throw new Error(
      `Could not read task ${taskId}. Check tasks show ${taskId} before retrying the update.`,
      { cause }
    );
  }
}
export async function renderFleetTaskMutation<
  T extends {
    task: { id: string } & Parameters<typeof renderTaskFleetDetails>[0];
  },
>(
  client: TuturuuuUserClient,
  workspaceId: string,
  group: string,
  json: boolean,
  response: T,
  blockers: ReturnType<typeof getBlockerFlags>
) {
  const hasChanges = blockers.add.length > 0 || blockers.remove.length > 0;
  const result = hasChanges
    ? await updateTaskBlockers(client, workspaceId, response, blockers)
    : response;
  render(result, { group, json });
  if (!json) renderTaskFleetDetails(result.task);
}
