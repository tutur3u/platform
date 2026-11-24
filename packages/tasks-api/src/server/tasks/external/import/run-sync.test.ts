import { beforeEach, describe, expect, it } from 'vitest';
import { importMappingSchema } from '../schemas';
import { FakeImportStore } from './fake-store.test-support';
import { issue } from './fixtures.test-support';
import { type ImportInput, runGithubImport } from './run';

const WS = 'ws-personal';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const VHPX = '22222222-2222-4222-8222-222222222222';
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

describe('idempotency', () => {
  const batch = () => [
    issue({
      number: 1,
      labels: ['bug'],
      comments: [
        {
          url: 'https://github.com/t/p/issues/1#c1',
          author: 'a',
          body: 'hi',
          created_at: '2023-05-02T00:00:00Z',
        },
      ],
      linked_prs: [{ url: 'https://github.com/o/r/pull/9' }],
    }),
    issue({
      number: 2,
      state: 'closed',
      state_reason: 'completed',
      closed_at: '2023-05-03T00:00:00Z',
    }),
  ];

  it('a second run creates nothing and writes nothing', async () => {
    const first = await run(batch());
    const writes = store.writes;
    const tasks = store.tasks.size;
    const second = await run(batch());
    expect(first.map((r) => r.action)).toEqual(['create', 'create']);
    expect(second.map((r) => r.action)).toEqual(['skip', 'skip']);
    expect(second.map((r) => r.task_id)).toEqual(first.map((r) => r.task_id));
    expect(store.tasks.size).toBe(tasks);
    expect(store.writes).toBe(writes);
    expect(store.refs.size).toBe(2);
    expect([...store.comments.values()].flat()).toHaveLength(1);
  });

  it('updates title, description, state and new comments without duplicating', async () => {
    const [created] = await run(batch());
    const changed = batch();
    changed[0] = issue({
      number: 1,
      title: 'Renamed',
      body: 'new body',
      state: 'closed',
      state_reason: 'completed',
      closed_at: '2024-01-01T00:00:00Z',
      comments: [
        {
          url: 'https://github.com/t/p/issues/1#c1',
          author: 'a',
          body: 'hi',
          created_at: '2023-05-02T00:00:00Z',
        },
        {
          url: 'https://github.com/t/p/issues/1#c2',
          author: 'a',
          body: 'later',
          created_at: '2024-01-02T00:00:00Z',
        },
      ],
      labels: ['bug'],
    });
    const [updated] = await run(changed);
    expect(updated).toMatchObject({
      action: 'update',
      task_id: created!.task_id,
    });
    const task = store.tasks.get(created!.task_id!)!;
    expect(task).toMatchObject({
      name: 'Renamed #1',
      list_id: 'l-done',
      completed: true,
    });
    expect(task.description).toContain('new body');
    expect(store.comments.get(created!.task_id!)).toHaveLength(2);
    expect(store.tasks.size).toBe(2);
    const events = store.history.filter(
      (h) =>
        h.task_id === created!.task_id && h.change_type === 'external_event'
    );
    expect(events.map((e) => e.new_value)).toEqual(['closed']);
  });

  it('moves a reopened issue back to the queue only when its state changed', async () => {
    const [created] = await run([
      issue({
        number: 1,
        state: 'closed',
        state_reason: 'completed',
        closed_at: '2023-05-03T00:00:00Z',
      }),
    ]);
    store.tasks.get(created!.task_id!)!.list_id = 'l-review'; // a person moved it
    await run([
      issue({
        number: 1,
        state: 'closed',
        state_reason: 'completed',
        closed_at: '2023-05-03T00:00:00Z',
      }),
    ]);
    expect(store.tasks.get(created!.task_id!)?.list_id).toBe('l-review');
    await run([issue({ number: 1, state: 'open' })]);
    expect(store.tasks.get(created!.task_id!)).toMatchObject({
      list_id: 'l-queued',
      completed: false,
      completed_at: null,
    });
  });

  it('reasserts the github label and keeps labels people added', async () => {
    const [created] = await run([issue({ number: 1 })]);
    const github = store.workspaceLabels.get('github')!;
    store.taskLabels.set(created!.task_id!, new Set(['manual-label']));
    const [again] = await run([issue({ number: 1 })]);
    expect(again?.action).toBe('update');
    expect([...store.taskLabels.get(created!.task_id!)!].sort()).toEqual(
      ['manual-label', github].sort()
    );
  });

  it('does not resurrect a deleted task', async () => {
    const [created] = await run([issue({ number: 1 })]);
    store.tasks.get(created!.task_id!)!.deleted_at = '2024-01-01T00:00:00Z';
    const [again] = await run([issue({ number: 1 })]);
    expect(again).toMatchObject({ action: 'skip', warnings: ['task_deleted'] });
  });

  it('dedupes on the ref URL, never on the name', async () => {
    const foreign = store.addForeignTask('Issue 1 #1');
    const [result] = await run([issue({ number: 1 })]);
    expect(result?.action).toBe('create');
    expect(result?.task_id).not.toBe(foreign);
    expect(store.tasks.size).toBe(2);
  });

  it('never updates or moves tasks without an external ref', async () => {
    const foreign = store.addForeignTask('Synced elsewhere', 'l-live');
    const before = JSON.stringify(store.tasks.get(foreign));
    await run([
      issue({ number: 1 }),
      issue({ number: 2, state: 'closed', state_reason: 'completed' }),
    ]);
    await run([issue({ number: 1, title: 'changed' })]);
    expect(JSON.stringify(store.tasks.get(foreign))).toBe(before);
    expect(store.taskLabels.has(foreign)).toBe(false);
  });

  it('turns a concurrent duplicate ref into a skip and removes the orphan task', async () => {
    const racing = issue({ number: 1 });
    const insert = store.insertRef.bind(store);
    store.insertRef = async (...args) => {
      store.refs.set(racing.url, {
        task_id: 'winner',
        external_state: 'open',
        external_state_reason: null,
        external_closed_at: null,
        external_labels: [],
        external_assignees: [],
        imported_by: 'x',
        values: {} as never,
      });
      return insert(...args);
    };
    const [result] = await run([racing]);
    expect(result).toMatchObject({
      action: 'skip',
      warnings: ['concurrent_import'],
    });
    expect(store.tasks.size).toBe(0);
  });
});

describe('dry run', () => {
  it('reports the plan and writes nothing, not even the github label', async () => {
    const results = await run([issue({ number: 1 }), issue({ number: 2 })], {
      dryRun: true,
    });
    expect(results.map((r) => [r.action, r.task_id])).toEqual([
      ['create', null],
      ['create', null],
    ]);
    expect(store.writes).toBe(0);
    expect(store.tasks.size).toBe(0);
    expect(store.workspaceLabels.size).toBe(0);
  });

  it('previews update and skip for imported issues', async () => {
    await run([issue({ number: 1 }), issue({ number: 2 })]);
    const writes = store.writes;
    const results = await run(
      [issue({ number: 1 }), issue({ number: 2, title: 'new' })],
      { dryRun: true }
    );
    expect(results.map((r) => r.action)).toEqual(['skip', 'update']);
    expect(store.writes).toBe(writes);
  });
});

describe('relationships', () => {
  it('turns a refused relationship into a warning instead of failing the batch', async () => {
    store.linkParentChild = async () => {
      throw new Error('child already has a parent');
    };
    const parentUrl = 'https://github.com/tutur3u/platform/issues/10';
    await run([issue({ number: 10 })]);
    const [result] = await run([issue({ number: 11, parent_url: parentUrl })]);
    expect(result).toMatchObject({ action: 'create' });
    expect(result?.error).toBeUndefined();
    expect(result?.warnings).toEqual(['relationship_failed']);
  });

  it('links parent and child once both tasks exist, across batches', async () => {
    const parentUrl = 'https://github.com/tutur3u/platform/issues/10';
    const childUrl = 'https://github.com/tutur3u/platform/issues/11';
    const first = await run([issue({ number: 11, parent_url: parentUrl })]);
    expect(first[0]?.warnings).toContain(`relationship_pending: ${parentUrl}`);
    expect(store.relationships).toHaveLength(0);

    const second = await run([
      issue({ number: 10, sub_issue_urls: [childUrl] }),
    ]);
    expect(second[0]?.warnings).toEqual([]);
    const parentId = store.refs.get(parentUrl)!.task_id;
    const childId = store.refs.get(childUrl)!.task_id;
    expect(store.relationships).toEqual([[parentId, childId]]);

    await run([
      issue({ number: 10, sub_issue_urls: [childUrl] }),
      issue({ number: 11, parent_url: parentUrl }),
    ]);
    expect(store.relationships).toHaveLength(1);
  });
});
