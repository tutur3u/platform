import type { WorkspaceTaskFleetFields } from '@tuturuuu/internal-api/tasks';
import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, parseCsv } from './args';
import { escapeTerminalText } from './select';

function readFlag(flags: Record<string, FlagValue>, name: string) {
  const value = flags[name];
  if (value === true) throw new Error(`--${name} requires a value`);
  return typeof value === 'string' ? value.trim() : undefined;
}

function parseLinkUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function getTaskFleetFlags(flags: Record<string, FlagValue>) {
  const fields: WorkspaceTaskFleetFields = {};
  const agents = readFlag(flags, 'agent-owners');
  const needsUser = readFlag(flags, 'needs-user');
  const reason = readFlag(flags, 'needs-user-reason');
  const links = readFlag(flags, 'links-json');

  if (agents !== undefined) {
    fields.virtual_assignees = [...new Set(parseCsv(agents))].map(
      (key, position) => ({ key, kind: 'agent', position })
    );
    if (
      fields.virtual_assignees.length > 50 ||
      fields.virtual_assignees.some(({ key }) => key.length > 128)
    ) {
      throw new Error(
        '--agent-owners accepts up to 50 keys of up to 128 characters'
      );
    }
  }
  if (needsUser !== undefined) {
    if (needsUser !== 'true' && needsUser !== 'false') {
      throw new Error('--needs-user requires true or false');
    }
    fields.needs_user = needsUser === 'true';
  }
  if (reason !== undefined) {
    if ([...reason.trim()].length > 512) {
      throw new Error('--needs-user-reason accepts up to 512 characters');
    }
    fields.needs_user_reason = reason || null;
  }
  if (links !== undefined) {
    const values: unknown = JSON.parse(links);
    if (!Array.isArray(values) || values.length > 50) {
      throw new Error('--links-json requires a JSON array of up to 50 links');
    }
    fields.task_resources = values.map((value: unknown) => {
      const url =
        typeof value === 'object' && value !== null && 'url' in value
          ? parseLinkUrl(value.url)
          : null;
      if (!url || !/^https?:$/.test(url.protocol) || url.href.length > 2048) {
        throw new Error(
          '--links-json entries require an HTTP(S) URL of up to 2048 characters'
        );
      }
      const title =
        typeof value === 'object' && value !== null && 'title' in value
          ? value.title
          : undefined;
      if (
        title !== undefined &&
        (typeof title !== 'string' ||
          !title.trim() ||
          title.trim().length > 256)
      ) {
        throw new Error('--links-json link titles must be 1 to 256 characters');
      }
      return {
        kind: 'link',
        url: url.href,
        ...(title ? { title: title.trim() } : {}),
      };
    });
  }
  return fields;
}

export function getBlockerFlags(flags: Record<string, FlagValue>) {
  const readIds = (name: string) => {
    const ids = [
      ...new Set(parseCsv(readFlag(flags, name)).map((id) => id.toLowerCase())),
    ];
    if (
      ids.some(
        (id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)
      )
    ) {
      throw new Error(`--${name} requires comma-separated task UUIDs`);
    }
    return ids;
  };
  const add = readIds('blocked-by');
  const remove = readIds('remove-blocked-by');
  if (add.some((id) => remove.includes(id))) {
    throw new Error('A blocker cannot be added and removed in one command');
  }
  return { add, remove };
}

export async function updateTaskBlockers<T extends { task: { id: string } }>(
  client: TuturuuuUserClient,
  workspaceId: string,
  response: T,
  { add, remove }: ReturnType<typeof getBlockerFlags>
) {
  const taskId = response.task.id;
  try {
    const active = new Set(
      (await client.tasks.getRelationships(workspaceId, taskId)).blockedBy.map(
        ({ id }) => id
      )
    );
    const payload = (id: string) => ({
      source_task_id: id,
      target_task_id: taskId,
      type: 'blocks' as const,
    });

    for (const id of add) {
      if (!active.has(id))
        await client.tasks.createRelationship(workspaceId, taskId, payload(id));
    }
    for (const id of remove) {
      if (active.has(id))
        await client.tasks.deleteRelationship(workspaceId, taskId, payload(id));
    }
    return await withTaskBlockers(client, workspaceId, response);
  } catch (cause) {
    throw new Error(
      `Task ${taskId} exists. Blocker changes could not be confirmed. Retry with tasks update ${taskId}.`,
      { cause }
    );
  }
}

export async function withTaskBlockers<T extends { task: { id: string } }>(
  client: TuturuuuUserClient,
  workspaceId: string,
  response: T
) {
  const { blockedBy } = await client.tasks.getRelationships(
    workspaceId,
    response.task.id
  );
  return { ...response, task: { ...response.task, blocked_by: blockedBy } };
}

export async function updateCreatedTaskFleetFields<
  T extends { task: { id: string } },
>(
  client: TuturuuuUserClient,
  workspaceId: string,
  response: T,
  fields: WorkspaceTaskFleetFields
) {
  const { id } = response.task;
  try {
    const updated = await client.tasks.update(workspaceId, id, fields);
    return {
      ...response,
      ...updated,
      task: { ...response.task, ...updated.task },
    };
  } catch (cause) {
    throw new Error(
      `Task ${id} was created. Retry the field flags with tasks update ${id}.`,
      { cause }
    );
  }
}

export function renderTaskFleetDetails(
  task: WorkspaceTaskFleetFields & {
    blocked_by?: { id: string; name: string }[];
    updated_at?: string;
  }
) {
  const lines = [
    ['Agent owners', task.virtual_assignees?.map(({ key }) => key).join(', ')],
    [
      'Needs user',
      task.needs_user == null ? undefined : task.needs_user ? 'yes' : 'no',
    ],
    ['Needs user reason', task.needs_user_reason],
    [
      'Links',
      task.task_resources
        ?.map(({ title, url }) => (title ? `${title} (${url})` : url))
        .join(', '),
    ],
    [
      'Blocked by',
      task.blocked_by?.map(({ id, name }) => `${name} (${id})`).join(', '),
    ],
    ['Updated at', task.updated_at],
  ];
  for (const [label, value] of lines) {
    if (value) process.stdout.write(`${label}: ${escapeTerminalText(value)}\n`);
  }
}
