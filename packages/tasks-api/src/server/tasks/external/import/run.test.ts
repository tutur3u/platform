import { beforeEach, describe, expect, it } from 'vitest';
import { importMappingSchema } from '../schemas';
import { FakeImportStore } from './fake-store.test-support';
import { issue } from './fixtures.test-support';
import { type ImportInput, runGithubImport } from './run';

const WS = 'ws-personal';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const VHPX = '22222222-2222-4222-8222-222222222222';
const ALICE = '33333333-3333-4333-8333-333333333333';
const OUTSIDER = '44444444-4444-4444-8444-444444444444';
const CYCLE = '55555555-5555-4555-8555-555555555555';

let store: FakeImportStore;
const run = (
  issues: ImportInput['issues'],
  overrides: Omit<Partial<ImportInput>, 'mapping'> & { mapping?: unknown } = {}
) =>
  runGithubImport(store, {
    actorId: ACTOR,
    board: store.board,
    dryRun: false,
    refreshContent: false,
    lists: store.lists,
    wsId: WS,
    issues,
    ...overrides,
    mapping: importMappingSchema.parse(
      overrides.mapping ?? { status_lists: {} }
    ),
  });

beforeEach(() => {
  store = new FakeImportStore(WS);
  store.members = new Set([ACTOR, VHPX]);
  store.cycles = new Set([CYCLE]);
});

describe('creating tasks', () => {
  it('imports open and closed issues into the right lists with the original dates', async () => {
    const results = await run([
      issue({ number: 1 }),
      issue({
        number: 2,
        state: 'closed',
        state_reason: 'completed',
        closed_at: '2023-05-03T00:00:00Z',
      }),
      issue({
        number: 3,
        state: 'closed',
        state_reason: 'not_planned',
        closed_at: '2023-05-04T00:00:00Z',
      }),
    ]);
    expect(results.map((r) => r.action)).toEqual([
      'create',
      'create',
      'create',
    ]);
    const byNumber = (n: number) => store.tasks.get(results[n - 1]!.task_id!)!;
    expect(byNumber(1)).toMatchObject({
      name: 'Issue 1 #1',
      list_id: 'l-queued',
      completed: false,
    });
    expect(byNumber(2)).toMatchObject({
      list_id: 'l-done',
      completed: true,
      completed_at: '2023-05-03T00:00:00.000Z',
    });
    expect(byNumber(3)).toMatchObject({
      list_id: 'l-closed',
      completed: false,
      closed_at: '2023-05-04T00:00:00.000Z',
    });
    expect(byNumber(1).created_at).toBe('2023-05-01T07:00:00.000Z');
    expect(byNumber(1).creator_id).toBe(ACTOR);
    expect(byNumber(1).description).toContain('markdown');
  });

  it('never appends a sync-tool suffix and never lands on a parking list', async () => {
    const [result] = await run([issue({ number: 9, title: 'Hello' })]);
    const task = store.tasks.get(result!.task_id!)!;
    expect(task.name).toBe('Hello #9');
    expect(['l-waiting', 'l-knowledge']).not.toContain(task.list_id);
  });

  it('records the external ref, its history, and the original close time', async () => {
    const [result] = await run([
      issue({
        number: 4,
        state: 'closed',
        state_reason: 'completed',
        closed_at: '2023-05-03T00:00:00Z',
        author: 'octocat',
        labels: ['bug', 'nova'],
      }),
    ]);
    const ref = store.refs.get('https://github.com/tutur3u/platform/issues/4')!;
    expect(ref).toMatchObject({ task_id: result!.task_id, imported_by: ACTOR });
    expect(ref.values).toMatchObject({
      external_repo: 'tutur3u/platform',
      external_number: 4,
      external_author: 'octocat',
      external_state: 'closed',
      external_state_reason: 'completed',
      external_labels: ['bug', 'nova'],
    });
    const types = store.history.map((h) => [
      h.change_type,
      h.changed_by,
      h.changed_at,
    ]);
    expect(types[0]?.slice(0, 2)).toEqual(['external_imported', ACTOR]);
    expect(types[1]).toEqual([
      'external_event',
      null,
      '2023-05-03T00:00:00.000Z',
    ]);
  });

  it('attaches the github label on create, creating it once', async () => {
    const results = await run([issue({ number: 1 }), issue({ number: 2 })]);
    const github = store.workspaceLabels.get('github')!;
    expect(github).toBeTruthy();
    for (const r of results)
      expect(store.taskLabels.get(r.task_id!)?.has(github)).toBe(true);
    expect([...store.workspaceLabels.keys()]).toEqual(['github']);
  });

  it('maps labels, priority, assignees, milestones and authors only through the mapping', async () => {
    const bugId = 'label-bug';
    store.workspaceLabels.set('bug', bugId);
    const mapping = {
      status_lists: {},
      labels: { bug: bugId, urgent: 'priority:high' },
      assignees: { vhpx: VHPX, ghost: OUTSIDER },
      authors: { alice: ALICE, vhpx: VHPX },
      milestones: { 'v0.12': CYCLE },
    };
    const [result] = await run(
      [
        issue({
          number: 5,
          labels: ['bug', 'urgent', 'nova'],
          assignees: ['vhpx', 'ghost', 'stranger'],
          milestone: 'v0.12',
          comments: [
            {
              url: 'https://github.com/tutur3u/platform/issues/5#issuecomment-1',
              author: 'vhpx',
              body: 'mine',
              created_at: '2023-05-02T00:00:00Z',
            },
            {
              url: 'https://github.com/tutur3u/platform/issues/5#issuecomment-2',
              author: 'alice',
              body: 'not a member',
              created_at: '2023-05-02T01:00:00Z',
            },
            {
              url: 'https://github.com/tutur3u/platform/issues/5#issuecomment-3',
              author: 'bob',
              body: 'unmapped',
              created_at: '2023-05-02T02:00:00Z',
            },
          ],
        }),
      ],
      { mapping }
    );
    const id = result!.task_id!;
    expect(store.tasks.get(id)?.priority).toBe('high');
    expect(store.taskLabels.get(id)?.has(bugId)).toBe(true);
    expect(store.taskAssignees.get(id)).toEqual([VHPX]);
    expect(
      store.refs.get('https://github.com/tutur3u/platform/issues/5')?.values
        .external_assignees
    ).toEqual(['ghost', 'stranger']);
    expect(store.cycleTasks).toEqual([[id, CYCLE]]);
    const comments = store.comments.get(id)!;
    expect(comments.map((c) => [c.external_author, c.author_id])).toEqual([
      ['vhpx', VHPX],
      ['alice', null],
      ['bob', null],
    ]);
    expect(comments[0]?.created_at).toBe('2023-05-02T00:00:00.000Z');
    expect(result?.warnings).toEqual(['unmapped_assignees: ghost, stranger']);
  });

  it('records the source timeline at its original times with mapped actors', async () => {
    const url = 'https://github.com/tutur3u/platform/issues/8';
    await run(
      [
        issue({
          number: 8,
          state: 'closed',
          state_reason: 'completed',
          closed_at: '2023-05-03T00:00:00Z',
          events: [
            {
              event: 'labeled',
              at: '2023-05-01T08:00:00Z',
              actor: 'stranger',
              label: 'bug',
            },
            { event: 'closed', at: '2023-05-03T00:00:00Z', actor: 'vhpx' },
            { event: 'reopened', at: '2023-05-04T00:00:00Z', actor: 'vhpx' },
            { event: 'closed', at: 'not a date', actor: 'vhpx' },
          ],
        }),
      ],
      { mapping: { status_lists: {}, authors: { vhpx: VHPX } } }
    );
    const events = store.history.filter(
      (h) => h.change_type === 'external_event'
    );
    expect(
      events.map((e) => [
        e.metadata.event,
        e.changed_at,
        e.changed_by,
        e.metadata.external_actor,
      ])
    ).toEqual([
      ['labeled', '2023-05-01T08:00:00.000Z', null, 'stranger'],
      ['closed', '2023-05-03T00:00:00.000Z', VHPX, 'vhpx'],
      ['reopened', '2023-05-04T00:00:00.000Z', VHPX, 'vhpx'],
    ]);
    expect(
      events.every(
        (e) => e.field_name === 'external' && e.metadata.external_url === url
      )
    ).toBe(true);
    expect(events[0]?.metadata.label).toBe('bug');
    expect(events[1]?.metadata.state_reason).toBe('completed');
  });

  it('links pull requests and commits into task links only', async () => {
    const [result] = await run([
      issue({
        number: 6,
        linked_prs: [{ url: 'https://github.com/o/r/pull/9', merged: true }],
        linked_commits: [{ url: 'https://github.com/o/r/commit/abcdef1' }],
      }),
    ]);
    expect(
      store.links.get(result!.task_id!)?.map((l) => [l.kind, l.state])
    ).toEqual([
      ['pull_request', 'merged'],
      ['commit', null],
    ]);
  });

  it('skips with a warning when the board has no list for the status', async () => {
    store.lists = store.lists.filter((l) => l.status !== 'done');
    const [result] = await run(
      [issue({ number: 1, state: 'closed', state_reason: 'completed' })],
      { lists: store.lists }
    );
    expect(result).toMatchObject({
      action: 'skip',
      task_id: null,
      warnings: ['no_target_list'],
    });
    expect(store.tasks.size).toBe(0);
  });

  it('reports one failing issue without losing the others', async () => {
    store.failCreateFor = 'boom';
    const results = await run([
      issue({ number: 1, title: 'boom' }),
      issue({ number: 2 }),
    ]);
    expect(results[0]).toMatchObject({
      action: 'skip',
      error: 'create failed',
    });
    expect(results[1]?.action).toBe('create');
  });
});
