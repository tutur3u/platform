import { readFile } from 'node:fs/promises';
import {
  isTaskStatusName,
  resolveStatusList,
  TASK_STATUS_NAMES,
} from '@tuturuuu/utils/task-board-status-list';
import {
  createTaskCollaborationApi,
  type TaskComment,
  type TaskTimelineEvent,
} from '@tuturuuu/internal-api/task-collaboration';
import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag } from './args';
import type { CliConfig } from './config';
import { selectTaskId } from './selection';

/** The collaboration endpoints for the CLI's authenticated task client. */
export function collaborationApi(client: TuturuuuUserClient) {
  return createTaskCollaborationApi(client.getTaskClientOptions());
}

export const TASK_COLLABORATION_ACTIONS = new Set([
  'comment',
  'comments',
  'link',
  'links',
  'timeline',
  'status',
]);

export interface TaskCollaborationOptions {
  client: TuturuuuUserClient;
  config: CliConfig;
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
  workspaceId: string;
}

const LEGACY_LINK_HINT =
  'This link lives in the legacy task resources list. Edit it with `ttr tasks update <task> --links-json`.';

function write(text: string) {
  process.stdout.write(`${text}\n`);
}

function emit(json: boolean, data: unknown, text: () => string) {
  write(json ? JSON.stringify(data, null, 2) : text());
}

function isUrl(value: string | undefined) {
  return Boolean(value && /^https?:\/\//iu.test(value));
}

function shortDate(value: string | null | undefined) {
  return value ? value.slice(0, 16).replace('T', ' ') : '-';
}

async function readBody(
  flags: Record<string, FlagValue>,
  rest: string[]
): Promise<string> {
  const inline = getFlag(flags, 'body');
  if (inline) return inline;
  const file = getFlag(flags, 'body-file');
  if (file) {
    if (file === '-') {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString('utf8');
    }
    return readFile(file, 'utf8');
  }
  const text = rest.join(' ').trim();
  if (text) return text;
  throw new Error(
    'Missing comment text. Pass it as an argument, --body, or --body-file.'
  );
}

async function resolveTask(
  options: TaskCollaborationOptions,
  explicit: string | undefined
) {
  const selection = await selectTaskId(
    options.client,
    options.config,
    options.workspaceId,
    options.flags,
    options.json,
    explicit || getFlag(options.flags, 'task')
  );
  return selection.taskId;
}

function authorName(comment: {
  author: { display_name: string } | null;
  external_author: string | null;
}) {
  return comment.author?.display_name ?? comment.external_author ?? 'unknown';
}

async function runComment(options: TaskCollaborationOptions, args: string[]) {
  const { client, flags, json, workspaceId } = options;
  const [sub = 'list', ...rest] = args;
  const api = collaborationApi(client);

  if (sub === 'list' || sub === 'ls') {
    const taskId = await resolveTask(options, rest[0]);
    const limit = Number.parseInt(getFlag(flags, 'limit') ?? '100', 10);
    const comments: TaskComment[] = [];
    let cursor: string | null | undefined;
    do {
      const page = await api.listComments(workspaceId, taskId, {
        cursor,
        limit: Math.min(Math.max(limit, 1), 100),
      });
      comments.push(...page.comments);
      cursor = page.nextCursor;
    } while (cursor && flags.all === true);
    emit(json, { comments, nextCursor: cursor ?? null }, () =>
      comments.length
        ? comments
            .map(
              (c) =>
                `${shortDate(c.created_at)}  ${authorName(c)}  ${c.id}\n${c.body}\n`
            )
            .join('\n')
        : 'No comments.'
    );
    return;
  }

  if (sub === 'add') {
    // With --body/--body-file every positional is the task; otherwise the
    // first is the task and the rest is the comment text.
    const bodyFromFlag = Boolean(
      getFlag(flags, 'body') || getFlag(flags, 'body-file')
    );
    const taskArg = rest[0];
    const text = await readBody(flags, bodyFromFlag ? [] : rest.slice(1));
    const taskId = await resolveTask(options, taskArg);
    const { comment } = await api.addComment(workspaceId, taskId, text);
    emit(json, { comment }, () => `Added comment ${comment.id}`);
    return;
  }

  if (sub === 'edit') {
    const [taskArg, commentId, ...text] = rest;
    if (!taskArg || !commentId) {
      throw new Error(
        'Usage: ttr tasks comment edit <task> <comment-id> <text>'
      );
    }
    const body = await readBody(flags, text);
    const taskId = await resolveTask(options, taskArg);
    const { comment } = await api.editComment(
      workspaceId,
      taskId,
      commentId,
      body
    );
    emit(json, { comment }, () => `Edited comment ${comment.id}`);
    return;
  }

  if (sub === 'rm' || sub === 'delete' || sub === 'remove') {
    const [taskArg, commentId] = rest;
    if (!taskArg || !commentId) {
      throw new Error('Usage: ttr tasks comment rm <task> <comment-id>');
    }
    const taskId = await resolveTask(options, taskArg);
    await api.removeComment(workspaceId, taskId, commentId);
    emit(
      json,
      { success: true, id: commentId },
      () => `Removed comment ${commentId}`
    );
    return;
  }

  throw new Error('Usage: ttr tasks comment <list|add|edit|rm> ...');
}

async function runLink(options: TaskCollaborationOptions, args: string[]) {
  const { client, flags, json, workspaceId } = options;
  const [sub = 'list', ...rest] = args;
  const api = collaborationApi(client);

  if (sub === 'list' || sub === 'ls') {
    const taskId = await resolveTask(options, rest[0]);
    const { links } = await api.listLinks(workspaceId, taskId);
    emit(json, { links }, () =>
      links.length
        ? links
            .map(
              (l) =>
                `${l.kind.padEnd(12)} ${(l.state ?? '-').padEnd(8)} ${l.url}${l.title ? `  ${l.title}` : ''}${l.legacy ? '  (legacy)' : `  ${l.id}`}`
            )
            .join('\n')
        : 'No linked resources.'
    );
    return;
  }

  if (sub === 'add') {
    const url = [...rest].reverse().find(isUrl);
    if (!url) throw new Error('Usage: ttr tasks link add [task] <https-url>');
    const taskArg = rest.find((value) => value !== url);
    const taskId = await resolveTask(options, taskArg);
    const { link } = await api.addLink(workspaceId, taskId, {
      url,
      ...(getFlag(flags, 'kind')
        ? { kind: getFlag(flags, 'kind') as never }
        : {}),
      ...(getFlag(flags, 'title') ? { title: getFlag(flags, 'title') } : {}),
      ...(getFlag(flags, 'state') ? { state: getFlag(flags, 'state') } : {}),
      ...(getFlag(flags, 'external-id')
        ? { external_id: getFlag(flags, 'external-id') }
        : {}),
    });
    emit(json, { link }, () => `Linked ${link.kind} ${link.url}`);
    return;
  }

  if (sub === 'rm' || sub === 'remove' || sub === 'delete') {
    const target = rest.at(-1);
    if (!target)
      throw new Error('Usage: ttr tasks link rm [task] <link-id|url>');
    const taskArg = rest.length > 1 ? rest[0] : undefined;
    const taskId = await resolveTask(options, taskArg);
    const { links } = await api.listLinks(workspaceId, taskId);
    const link = links.find((l) => l.id === target || l.url === target);
    if (!link) throw new Error(`No linked resource matches ${target}.`);
    if (link.id === null) throw new Error(LEGACY_LINK_HINT);
    await api.removeLink(workspaceId, taskId, link.id);
    emit(
      json,
      { success: true, id: link.id },
      () => `Removed link ${link.url}`
    );
    return;
  }

  throw new Error('Usage: ttr tasks link <list|add|rm> ...');
}

function describeEvent(event: {
  type: string;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown>;
  comment?: { body: string };
}) {
  const meta = event.metadata;
  if (event.comment)
    return event.comment.body.split('\n')[0]?.slice(0, 100) ?? '';
  if (typeof meta.event === 'string') return String(meta.event);
  if (typeof meta.url === 'string') return meta.url;
  if (event.field_name) {
    return `${event.field_name}: ${JSON.stringify(event.old_value)} -> ${JSON.stringify(event.new_value)}`;
  }
  return '';
}

async function runTimeline(options: TaskCollaborationOptions, args: string[]) {
  const { client, flags, json, workspaceId } = options;
  const taskId = await resolveTask(options, args[0]);
  const limit = Math.min(
    Math.max(Number.parseInt(getFlag(flags, 'limit') ?? '50', 10), 1),
    100
  );
  const events: TaskTimelineEvent[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await collaborationApi(client).timeline(workspaceId, taskId, {
      cursor,
      limit,
    });
    events.push(...page.events);
    cursor = page.nextCursor;
  } while (cursor && flags.all === true);
  emit(json, { events, nextCursor: cursor ?? null }, () =>
    events.length
      ? events
          .map(
            (e) =>
              `${shortDate(e.at)}  ${e.type.padEnd(18)} ${(e.actor?.display_name ?? e.external_actor ?? '-').padEnd(16)} ${describeEvent(e)}`
          )
          .join('\n')
      : 'No history.'
  );
}

async function runStatus(options: TaskCollaborationOptions, args: string[]) {
  const { client, json, workspaceId } = options;
  const [taskArg, rawStatus] = args.length > 1 ? args : [undefined, args[0]];
  const status = rawStatus?.toLowerCase();
  if (!status || !isTaskStatusName(status)) {
    throw new Error(
      `Usage: ttr tasks status <task> <${TASK_STATUS_NAMES.join('|')}>`
    );
  }
  const taskId = await resolveTask(options, taskArg);
  const { task } = await client.tasks.get(workspaceId, taskId);
  if (!task.board_id) throw new Error('Could not resolve the task board.');
  const { board } = await client.tasks.getBoard(workspaceId, task.board_id);
  const target = resolveStatusList(
    (board.task_lists ?? []).map((list) => ({
      archived: false,
      deleted: list.deleted ?? false,
      id: list.id,
      name: list.name,
      position: list.position,
      status: list.status,
    })),
    status,
    board
  );
  if (!target)
    throw new Error(`This board has no list for status "${status}".`);
  if (target.id === task.list_id) {
    emit(
      json,
      { task, list_id: target.id, changed: false },
      () => `Already in ${target.name ?? target.id}`
    );
    return;
  }
  const moved = await client.tasks.move(workspaceId, taskId, {
    list_id: target.id,
  });
  emit(
    json,
    { ...moved, list_id: target.id, changed: true },
    () => `Moved to ${target.name ?? target.id} (${status})`
  );
}

/** Handles `ttr tasks comment|link|timeline|status ...`. */
export async function runTaskCollaborationCommand(
  options: TaskCollaborationOptions
) {
  const [, action, ...rest] = options.positionals;
  if (action === 'comment' || action === 'comments')
    return runComment(options, rest);
  if (action === 'link' || action === 'links') return runLink(options, rest);
  if (action === 'timeline') return runTimeline(options, rest);
  if (action === 'status') return runStatus(options, rest);
  throw new Error(`Unknown task command: ${action}`);
}
