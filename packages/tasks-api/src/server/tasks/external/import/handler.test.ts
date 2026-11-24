import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeImportStore } from './fake-store.test-support';
import { issue } from './fixtures.test-support';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
}));
vi.mock('../../route-auth', () => ({ normalizeRouteWorkspaceId: vi.fn() }));

import { handleGithubImportPOST } from './handler';

const WS = '22222222-2222-4222-8222-222222222222';
const OTHER_WS = '66666666-6666-4666-8666-666666666666';
const USER = { id: '11111111-1111-4111-8111-111111111111' };
const BOARD = '77777777-7777-4777-8777-777777777777';
const auth = { supabase: {} as never, user: USER as never };

let store: FakeImportStore;
let allowed: boolean;
const deps = () => ({
  createStore: () => store,
  getAdmin: async () => ({}) as never,
  hasPermission: async () => allowed,
  resolveWorkspaceId: async ({ wsId }: { wsId: string }) =>
    wsId === 'personal' ? WS : wsId,
});
const post = (body: unknown, wsId = WS) =>
  handleGithubImportPOST(
    new NextRequest('http://localhost/import', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ wsId }) },
    auth,
    deps()
  );
const body = (overrides: Record<string, unknown> = {}) => ({
  board_id: BOARD,
  dry_run: false,
  mapping: { status_lists: {} },
  issues: [issue({ number: 1 })],
  ...overrides,
});

beforeEach(() => {
  allowed = true;
  store = new FakeImportStore(WS);
  store.board.id = BOARD;
});

describe('POST tasks/import/github', () => {
  it('imports a batch and returns one result per issue', async () => {
    const response = await post(body());
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.results).toEqual([
      expect.objectContaining({
        url: 'https://github.com/tutur3u/platform/issues/1',
        number: 1,
        action: 'create',
        warnings: [],
      }),
    ]);
    expect(store.tasks.size).toBe(1);
  });

  it('is idempotent across requests', async () => {
    await post(body());
    const second = await (await post(body())).json();
    expect(second.results[0].action).toBe('skip');
    expect(store.tasks.size).toBe(1);
  });

  it('denies callers without manage_projects and writes nothing', async () => {
    allowed = false;
    const response = await post(body());
    expect(response.status).toBe(403);
    expect(store.writes).toBe(0);
  });

  it('works for a personal workspace through the same permission check', async () => {
    const response = await post(body(), 'personal');
    expect(response.status).toBe(200);
    expect(store.tasks.size).toBe(1);
  });

  it('treats a board from another workspace as missing', async () => {
    store = new FakeImportStore(OTHER_WS);
    store.board.id = BOARD;
    const response = await post(body());
    expect(response.status).toBe(404);
    expect(store.writes).toBe(0);
  });

  it('rejects more than 25 issues, bad URLs and empty batches', async () => {
    const many = Array.from({ length: 26 }, (_, i) => issue({ number: i + 1 }));
    expect((await post(body({ issues: many }))).status).toBe(400);
    expect((await post(body({ issues: [] }))).status).toBe(400);
    const bad = {
      ...issue({ number: 1 }),
      url: 'http://github.com/x/y/issues/1',
    };
    expect((await post(body({ issues: [bad] }))).status).toBe(400);
    expect((await post({ ...body(), board_id: 'nope' })).status).toBe(400);
    expect(store.writes).toBe(0);
  });

  it('accepts exactly 25 issues', async () => {
    const issues = Array.from({ length: 25 }, (_, i) =>
      issue({ number: i + 1 })
    );
    const json = await (await post(body({ issues }))).json();
    expect(json.results).toHaveLength(25);
  });

  it('keeps edited content on re-runs unless refresh_content is set', async () => {
    await post(body());
    const task = [...store.tasks.values()][0]!;
    task.name = 'My own name';
    const changed = [issue({ number: 1, title: 'Upstream title' })];
    await post(body({ issues: changed }));
    expect(task.name).toBe('My own name');
    await post(body({ issues: changed, refresh_content: true }));
    expect(task.name).toBe('Upstream title #1');
  });

  it('honors dry_run', async () => {
    const json = await (await post(body({ dry_run: true }))).json();
    expect(json.results[0]).toMatchObject({ action: 'create', task_id: null });
    expect(store.tasks.size).toBe(0);
  });
});
