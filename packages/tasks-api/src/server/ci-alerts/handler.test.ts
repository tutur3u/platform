import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from '../tasks/external/fake-db.test-support';

vi.mock('../tasks/create-sort-key', () => ({
  resolveCreateTaskSortKey: vi.fn(async () => ({ error: null, sortKey: 1000 })),
}));
vi.mock('../tasks/insert-workspace-task', () => ({
  insertWorkspaceTask: vi.fn(
    async (db: FakeDb, insert: Record<string, unknown>) => {
      const { data, error } = await db.from('tasks').insert(insert);
      return { data: (data as Record<string, unknown>[] | null)?.[0], error };
    }
  ),
}));

import {
  alertTaskName,
  CiAlertSchema,
  isAuthorizedCiAlertToken,
  readCiAlertConfig,
  syncCiAlert,
} from './handler';

const TOKEN = 'a'.repeat(40);
const ACTOR = '00000000-0000-4000-8000-000000000001';
const config = {
  tokens: [TOKEN],
  openListId: 'list-open',
  doneListId: 'list-done',
  actorId: ACTOR,
};
const RUN = 'https://github.com/tutur3u/platform/actions/runs/';

function alert(state: 'failing' | 'recovered', run = 1, key = 'mobile-store') {
  return CiAlertSchema.parse({
    key,
    state,
    title: 'Mobile store publication failing',
    body: `report ${run}`,
    runUrl: `${RUN}${run}/attempts/1`,
  });
}

let db: FakeDb;
const admin = () => db as unknown as TypedSupabaseClient;

beforeEach(() => {
  const list = (id: string, board = 'board') => ({
    id,
    board_id: board,
    deleted: false,
    workspace_boards: { ws_id: 'ws' },
  });
  db = new FakeDb().seed('task_lists', [
    list('list-open'),
    list('list-done'),
    list('list-in-progress'),
    list('list-other', 'other-board'),
  ]);
  db.uniques.set('private.task_comments', (row, rows) =>
    rows.some(
      (r) => r.task_id === row.task_id && r.external_url === row.external_url
    )
  );
  // The fake builder has no LIKE or embedded-column filters; the handler only
  // uses a literal prefix and one embedded equality.
  const query = Object.getPrototypeOf(db.from('tasks'));
  if (query.ciAlertShim) return;
  query.ciAlertShim = true;
  const eq = query.eq;
  // `task_lists.<column>` resolves through the task's current list, like the
  // task_lists!inner embed does.
  query.eq = function (
    this: {
      db: FakeDb;
      filters: Array<(row: Record<string, unknown>) => boolean>;
    },
    column: string,
    value: unknown
  ) {
    if (!column.startsWith('task_lists.')) return eq.call(this, column, value);
    const child = column.slice('task_lists.'.length);
    this.filters.push(
      (row) =>
        this.db.rows('task_lists').find((list) => list.id === row.list_id)?.[
          child
        ] === value
    );
    return this;
  };
  query.like = function (
    this: { filters: Array<(row: Record<string, unknown>) => boolean> },
    column: string,
    pattern: string
  ) {
    const prefix = pattern.replace(/%$/u, '');
    this.filters.push((row) => String(row[column] ?? '').startsWith(prefix));
    return this;
  };
});

describe('CI alert sink', () => {
  it('needs every config value and a long enough token', () => {
    const env = {
      TASKS_CI_ALERT_TOKENS: `short, ${TOKEN}`,
      TASKS_CI_ALERT_LIST_ID: 'l',
      TASKS_CI_ALERT_DONE_LIST_ID: 'd',
      TASKS_CI_ALERT_ACTOR_ID: '00000000-0000-4000-8000-000000000001',
    };
    expect(readCiAlertConfig(env)?.tokens).toEqual([TOKEN]);
    expect(
      readCiAlertConfig({ ...env, TASKS_CI_ALERT_ACTOR_ID: 'not-a-uuid' })
    ).toBeNull();
    // Seed-style ids (version digit 0) are valid Postgres uuids.
    expect(
      readCiAlertConfig({
        ...env,
        TASKS_CI_ALERT_ACTOR_ID: '00000000-0000-0000-0000-000000000001',
      })?.actorId
    ).toBe('00000000-0000-0000-0000-000000000001');
    expect(
      readCiAlertConfig({ ...env, TASKS_CI_ALERT_ACTOR_ID: '' })
    ).toBeNull();
    expect(
      readCiAlertConfig({ ...env, TASKS_CI_ALERT_TOKENS: 'x' })
    ).toBeNull();
  });

  it('accepts only a configured token', async () => {
    expect(await isAuthorizedCiAlertToken(TOKEN, [TOKEN])).toBe(true);
    expect(await isAuthorizedCiAlertToken(`${TOKEN}b`, [TOKEN])).toBe(false);
    expect(await isAuthorizedCiAlertToken(null, [TOKEN])).toBe(false);
  });

  it('rejects keys with LIKE wildcards and non-Actions run URLs', () => {
    const base = {
      state: 'failing',
      title: 't',
      body: 'b',
      runUrl: `${RUN}1`,
    };
    expect(CiAlertSchema.safeParse({ ...base, key: 'a%' }).success).toBe(false);
    expect(CiAlertSchema.safeParse({ ...base, key: 'a_b' }).success).toBe(
      false
    );
    expect(
      CiAlertSchema.safeParse({
        ...base,
        key: 'ok',
        runUrl: 'https://example.com/x',
      }).success
    ).toBe(false);
  });

  it('opens one task, comments on repeats, and resolves on recovery', async () => {
    const opened = await syncCiAlert(admin(), config, alert('failing', 1));
    expect(opened.action).toBe('open');
    expect(db.rows('private.task_comments')).toHaveLength(1);
    const task = db.rows('tasks')[0];
    expect(task).toMatchObject({
      name: alertTaskName(alert('failing')),
      list_id: 'list-open',
      creator_id: ACTOR,
      priority: 'high',
    });

    const repeat = await syncCiAlert(admin(), config, alert('failing', 2));
    expect(repeat).toEqual({ action: 'comment', taskId: opened.taskId });
    // A retried report for the same run adds no second comment.
    await syncCiAlert(admin(), config, alert('failing', 2));
    expect(db.rows('private.task_comments')).toHaveLength(2);
    expect(db.rows('tasks')).toHaveLength(1);

    const closed = await syncCiAlert(admin(), config, alert('recovered', 3));
    expect(closed).toEqual({ action: 'close', taskId: opened.taskId });
    expect(task).toMatchObject({ list_id: 'list-done', completed: true });
    expect(db.rows('private.task_comments')).toHaveLength(3);

    expect(await syncCiAlert(admin(), config, alert('recovered', 4))).toEqual({
      action: 'none',
      taskId: null,
    });
  });

  it('records the opening run once and finds a task moved to another list', async () => {
    const opened = await syncCiAlert(admin(), config, alert('failing', 1));
    // A re-sent report of the opening run adds nothing.
    await syncCiAlert(admin(), config, alert('failing', 1));
    expect(db.rows('private.task_comments')).toHaveLength(1);
    const task = db.rows('tasks')[0] as Record<string, unknown>;
    task.list_id = 'list-in-progress';
    expect(await syncCiAlert(admin(), config, alert('failing', 2))).toEqual({
      action: 'comment',
      taskId: opened.taskId,
    });
    expect(db.rows('tasks')).toHaveLength(1);

    // A task moved off the alert board is no longer the alert's task.
    task.list_id = 'list-other';
    expect(
      (await syncCiAlert(admin(), config, alert('failing', 3))).action
    ).toBe('open');
    expect(db.rows('tasks')).toHaveLength(2);
  });

  it('fails closed when the done list is on another board', async () => {
    await expect(
      syncCiAlert(
        admin(),
        { ...config, doneListId: 'list-other' },
        alert('failing')
      )
    ).rejects.toThrow('not configured');
  });

  it('keeps separate tasks per key', async () => {
    await syncCiAlert(admin(), config, alert('failing', 1, 'planner-held:a'));
    await syncCiAlert(admin(), config, alert('failing', 1, 'planner-held:b'));
    expect(db.rows('tasks')).toHaveLength(2);
  });

  it('fails closed when the alert list is missing', async () => {
    await expect(
      syncCiAlert(admin(), { ...config, openListId: 'gone' }, alert('failing'))
    ).rejects.toThrow('not configured');
  });
});
