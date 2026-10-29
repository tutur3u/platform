import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  memberships: vi.fn(),
  actor: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifySecret: async () => true,
}));
vi.mock('../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'ws-a',
  resolveRequestActorAuthUid: mocks.actor,
}));
vi.mock('../../../lib/user-groups/groups-utils', () => ({
  getUserGroupMembershipsForActor: mocks.memberships,
}));

import { GET, POST } from './[reportId]/delivery/route';

type Row = Record<string, unknown>;
let rows: Row[];
const ACTIONS = ['preview', 'test', 'send', 'retry', 'cancel'] as const;

function query(initial: Row[]) {
  let result = initial;
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => {
      result = result.filter((row) => row[key] === value);
      return q;
    },
    in: (key: string, values: unknown[]) => {
      result = result.filter((row) => values.includes(row[key]));
      return q;
    },
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: result[0] ?? null, error: null }),
    // biome-ignore lint/suspicious/noThenProperty: Supabase builders are awaitable.
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: result, error: null })),
  };
  return q;
}
const db = {
  from: (table: string) =>
    query(table === 'external_user_monthly_reports_workspace_view' ? rows : []),
  schema: () => db,
  rpc: mocks.rpc,
};
function allow(manager: boolean) {
  mocks.permissions.mockResolvedValue({
    wsId: 'ws-a',
    containsPermission: (name: string) => name !== 'manage_users' || manager,
  });
}
function row(groupId: string, groupWsId = 'ws-a'): Row {
  return {
    id: 'report-1',
    title: 'Synthetic',
    content: `content-${groupId}`,
    feedback: 'feedback',
    score: 1,
    user_id: 'user-1',
    user_email: 'learner@example.invalid',
    user_full_name: 'Learner',
    group_name: `name-${groupId}`,
    creator_full_name: 'Teacher',
    report_approval_status: 'APPROVED',
    delivery_status: 'draft',
    user_ws_id: 'ws-a',
    group_ws_id: groupWsId,
    group_id: groupId,
  };
}
const context = {
  params: Promise.resolve({ wsId: 'ws-a', reportId: 'report-1' }),
};
const post = (action: string) =>
  POST(
    new Request('https://example.invalid/delivery', {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
    context
  );
const previewGet = () =>
  GET(new Request('https://example.invalid/delivery?preview=true'), context);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(db);
  mocks.actor.mockResolvedValue('actor');
  mocks.memberships.mockResolvedValue(['group-a']);
  mocks.rpc.mockResolvedValue({
    data: { code: 200, queued: true, status: 'queued' },
    error: null,
  });
  allow(false);
  rows = [row('group-a')];
});

describe('report delivery group scope', () => {
  describe('report whose group belongs to another workspace', () => {
    beforeEach(() => {
      rows = [row('group-a', 'ws-b')];
    });
    it.each([true, false])(
      'withholds the preview from GET (manager: %s)',
      async (manager) => {
        allow(manager);
        const response = await previewGet();
        expect(response.status).toBe(404);
        expect(JSON.stringify(await response.json())).not.toContain('name-');
      }
    );
    it.each(ACTIONS.flatMap((a) => [[a, true] as const, [a, false] as const]))(
      'POST %s returns 404 with no preview and no queue write (manager: %s)',
      async (action, manager) => {
        allow(manager);
        const response = await post(action);
        expect(response.status).toBe(404);
        expect(JSON.stringify(await response.json())).not.toContain('name-');
        expect(mocks.rpc).not.toHaveBeenCalled();
      }
    );
  });

  describe('sender limited to other groups', () => {
    beforeEach(() => {
      rows = [row('group-b')];
    });
    it('withholds the GET preview', async () => {
      expect((await previewGet()).status).toBe(404);
    });
    it.each(ACTIONS)('POST %s returns 404 without queueing', async (action) => {
      const response = await post(action);
      expect(response.status).toBe(404);
      expect(JSON.stringify(await response.json())).not.toContain('content-');
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it('treats an unresolved actor as having no groups', async () => {
      mocks.actor.mockResolvedValue(null);
      rows = [row('group-a')];
      expect((await post('send')).status).toBe(404);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });

  describe('sender limited to the report group', () => {
    it('previews the report through POST', async () => {
      const body = await (await post('preview')).json();
      expect(body.queued).toBe(false);
      expect(body.preview.content).toBe('content-group-a');
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it.each(['test', 'send', 'retry', 'cancel'] as const)(
      'POST %s reaches the delivery request',
      async (action) => {
        expect((await post(action)).status).toBe(200);
        expect(mocks.rpc).toHaveBeenCalledWith(
          'request_periodic_report_delivery',
          expect.objectContaining({ p_report_id: 'report-1', p_action: action })
        );
      }
    );
  });

  describe('workspace user manager', () => {
    beforeEach(() => {
      allow(true);
      rows = [row('group-b')];
    });
    it('previews reports of any group', async () => {
      const response = await previewGet();
      expect(response.status).toBe(200);
      expect((await response.json()).content).toBe('content-group-b');
      expect(mocks.memberships).not.toHaveBeenCalled();
    });
    it.each(ACTIONS)('POST %s is allowed across groups', async (action) => {
      expect((await post(action)).status).toBe(200);
    });
  });
});
