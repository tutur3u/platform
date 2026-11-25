// CI alert sink: keeps one open task per alert key on a configured board so
// repository workflows report failures without opening public GitHub issues.
//
// The caller holds one shared secret (`x-ci-alert-token`) that can only open
// tasks in the alert list, and comment on or resolve open `[alert:<key>] ...`
// tasks on the alert board. It never reads tasks, other boards or workspace
// data.
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { deriveTaskDescriptionYjsState } from '@tuturuuu/utils/yjs-task-description';
import { z } from 'zod';
import { resolveCreateTaskSortKey } from '../tasks/create-sort-key';
import { insertWorkspaceTask } from '../tasks/insert-workspace-task';

export const CI_ALERT_TOKEN_HEADER = 'x-ci-alert-token';
export const CI_ALERT_COMMENT_AUTHOR = 'ci-alert';

export const CiAlertSchema = z.object({
  // No LIKE wildcards (`%`, `_`) so the key is safe in a prefix match.
  key: z.string().regex(/^[a-z0-9][a-z0-9:.-]{0,79}$/u),
  state: z.enum(['failing', 'recovered']),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  // One comment per run attempt, so a re-run of failed jobs still reports.
  runUrl: z
    .url()
    .max(2048)
    .regex(
      /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+(\/attempts\/\d+)?$/u
    ),
});

export type CiAlert = z.infer<typeof CiAlertSchema>;
export type CiAlertAction = 'open' | 'comment' | 'close' | 'none';

export type CiAlertConfig = {
  tokens: string[];
  openListId: string;
  doneListId: string;
  actorId: string;
};

export function readCiAlertConfig(
  env: Record<string, string | undefined>
): CiAlertConfig | null {
  const tokens = (env.TASKS_CI_ALERT_TOKENS ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length >= 32);
  const openListId = env.TASKS_CI_ALERT_LIST_ID?.trim();
  const doneListId = env.TASKS_CI_ALERT_DONE_LIST_ID?.trim();
  const actorId = env.TASKS_CI_ALERT_ACTOR_ID?.trim();
  if (!tokens.length || !openListId || !doneListId || !actorId) return null;
  // The audit actor must have the uuid shape the admin client and Postgres
  // accept (any 8-4-4-4-12 hex, including seed ids); anything else is a config
  // error.
  if (!z.guid().safeParse(actorId).success) return null;
  return { tokens, openListId, doneListId, actorId };
}

async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  );
}

/** Constant-time match of the presented token against every configured one. */
export async function isAuthorizedCiAlertToken(
  presented: string | null,
  tokens: string[]
) {
  if (!presented) return false;
  const actual = await digest(presented);
  let matched = false;
  for (const token of tokens) {
    const expected = await digest(token);
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1)
      diff |= (expected[i] ?? 0) ^ (actual[i] ?? 0);
    matched = matched || diff === 0;
  }
  return matched;
}

export function alertTaskName(alert: Pick<CiAlert, 'key' | 'title'>) {
  return `[alert:${alert.key}] ${alert.title}`;
}

/** A minimal TipTap document: one plain-text paragraph per non-empty line. */
export function alertDescription(text: string) {
  const content = text
    .split('\n')
    .map((line) =>
      line.trim()
        ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
        : { type: 'paragraph' }
    );
  return JSON.stringify({ type: 'doc', content });
}

type ListRow = { id: string; board_id: string; ws_id: string };

async function loadList(
  admin: TypedSupabaseClient,
  listId: string
): Promise<ListRow | null> {
  const { data, error } = await admin
    .from('task_lists')
    .select('id, board_id, workspace_boards!inner(ws_id)')
    .eq('id', listId)
    .eq('deleted', false)
    .maybeSingle();
  if (error || !data) return null;
  const board = data.workspace_boards as { ws_id: string } | null;
  if (!board?.ws_id) return null;
  return { id: data.id, board_id: data.board_id, ws_id: board.ws_id };
}

// Any open task on the alert board counts, whichever list it was moved to.
async function findOpenAlertTask(
  admin: TypedSupabaseClient,
  boardId: string,
  key: string
) {
  const { data, error } = await admin
    .from('tasks')
    .select('id, task_lists!inner(board_id)')
    .eq('task_lists.board_id', boardId)
    .is('deleted_at', null)
    .is('completed_at', null)
    .is('closed_at', null)
    .like('name', `[alert:${key}] %`)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw new Error('Failed to look up the alert task');
  return data?.[0]?.id ?? null;
}

async function addComment(
  admin: TypedSupabaseClient,
  taskId: string,
  wsId: string,
  alert: CiAlert
) {
  // One comment per run URL: retries and re-sent reports stay idempotent.
  const { error } = await admin.schema('private').from('task_comments').upsert(
    {
      task_id: taskId,
      ws_id: wsId,
      author_id: null,
      external_author: CI_ALERT_COMMENT_AUTHOR,
      external_url: alert.runUrl,
      body: alert.body,
    },
    { onConflict: 'task_id,external_url', ignoreDuplicates: true }
  );
  if (error) throw new Error('Failed to comment on the alert task');
}

export async function syncCiAlert(
  admin: TypedSupabaseClient,
  config: CiAlertConfig,
  alert: CiAlert
): Promise<{ action: CiAlertAction; taskId: string | null }> {
  const list = await loadList(admin, config.openListId);
  const done = await loadList(admin, config.doneListId);
  if (!list || !done || done.board_id !== list.board_id)
    throw new Error('The alert lists are not configured');
  const existing = await findOpenAlertTask(admin, list.board_id, alert.key);

  if (alert.state === 'recovered') {
    if (!existing) return { action: 'none', taskId: null };
    await addComment(admin, existing, list.ws_id, alert);
    const now = new Date().toISOString();
    const { error } = await admin
      .from('tasks')
      .update({
        list_id: done.id,
        completed: true,
        completed_at: now,
      })
      .eq('id', existing);
    if (error) throw new Error('Failed to resolve the alert task');
    return { action: 'close', taskId: existing };
  }

  if (existing) {
    await addComment(admin, existing, list.ws_id, alert);
    return { action: 'comment', taskId: existing };
  }

  const sortKey = await resolveCreateTaskSortKey(admin, {
    boardId: list.board_id,
    listId: list.id,
    userId: config.actorId,
  });
  if (sortKey.error || sortKey.sortKey == null)
    throw new Error('Failed to place the alert task');
  const description = alertDescription(`${alert.body}\n\nRun: ${alert.runUrl}`);
  const { data, error } = await insertWorkspaceTask(
    admin,
    {
      name: alertTaskName(alert),
      description,
      description_yjs_state: deriveTaskDescriptionYjsState(description),
      creator_id: config.actorId,
      list_id: list.id,
      sort_key: sortKey.sortKey,
      priority: 'high',
      completed: false,
    },
    false
  );
  if (error || !data) throw new Error('Failed to open the alert task');
  // Record the opening run like any later one, so a re-sent report is a no-op.
  await addComment(admin, data.id, list.ws_id, alert);
  return { action: 'open', taskId: data.id };
}
