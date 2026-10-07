import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  getPostEmailQueueRows: vi.fn(),
  summarizePostEmailQueue: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));
vi.mock('@/lib/post-email-queue', () => ({
  getPostEmailQueueRows: mocks.getPostEmailQueueRows,
  summarizePostEmailQueue: mocks.summarizePostEmailQueue,
}));

import { GET as webGet } from '../../../../../../apps/web/src/app/api/v1/workspaces/[wsId]/users/approvals/get';
import { handleGetApprovalsRequest } from './get';

const ws = 'workspace-1';
const actor = { id: 'actor-1', email: 'approver@example.test' };
const context = { params: Promise.resolve({ wsId: ws }) };
const own = (id: string, user = ws, group: string | null = ws) => ({
  id,
  user_ws_id: user,
  group_ws_id: group,
  report_approval_status: 'PENDING',
  title: 'Synthetic report',
  content: 'Synthetic lesson',
  feedback: null,
});
let rows: ReturnType<typeof own>[];
let allowed: boolean;
let reads: number;

function query() {
  reads++;
  const filters: [string, unknown][] = [];
  let start = 0;
  let end = Number.MAX_SAFE_INTEGER;
  let head = false;
  const result = () => {
    const matching = rows.filter((row) =>
      filters.every(([key, value]) => row[key as keyof typeof row] === value)
    );
    return {
      data: head ? null : matching.slice(start, end + 1),
      count: matching.length,
      error: null,
    };
  };
  const q = {
    select: (_columns: string, options?: { head?: boolean }) => {
      head = !!options?.head;
      return q;
    },
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return q;
    },
    order: () => q,
    range: (from: number, to: number) => {
      start = from;
      end = to;
      return q;
    },
    // biome-ignore lint/suspicious/noThenProperty: emulate the real lazy PostgREST query contract.
    then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
      Promise.resolve(result()).then(resolve),
  };
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [
    own('own-1'),
    own('foreign-group', ws, 'workspace-2'),
    own('null-group', ws, null),
    own('foreign-subject', 'workspace-2'),
    own('own-2'),
  ];
  reads = 0;
  allowed = true;
  mocks.normalizeWorkspaceId.mockResolvedValue(ws);
  mocks.getPermissions.mockImplementation(async () => ({
    containsPermission: () => allowed,
  }));
  mocks.createAdminClient.mockResolvedValue({
    schema: () => ({ from: query }),
  });
});

for (const [name, get] of [
  [
    'Contacts',
    (request: Request) => handleGetApprovalsRequest(request, context, actor),
  ],
  ['Web', (request: Request) => webGet(request, context)],
] as const) {
  describe(`${name} periodic approval read tenancy`, () => {
    it('excludes foreign/null groups from items AND exact count', async () => {
      const response = await get(
        new Request('https://example.test/?kind=reports&limit=10')
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.items.map((item: { id: string }) => item.id)).toEqual([
        'own-1',
        'own-2',
      ]);
      expect(body.totalCount).toBe(2);
      expect(body.totalPages).toBe(1);
    });
    it('paginates only the same tenant population used for count', async () => {
      const response = await get(
        new Request('https://example.test/?kind=reports&page=2&limit=1')
      );
      const body = await response.json();
      expect(body.items.map((item: { id: string }) => item.id)).toEqual([
        'own-2',
      ]);
      expect(body.totalCount).toBe(2);
      expect(body.totalPages).toBe(2);
    });
    it('preserves foreign-subject exclusion', async () => {
      rows = [own('foreign-subject', 'workspace-2')];
      const response = await get(
        new Request('https://example.test/?kind=reports')
      );
      expect(await response.json()).toMatchObject({ items: [], totalCount: 0 });
    });
    it('rejects permission denial before content reads', async () => {
      allowed = false;
      const response = await get(
        new Request('https://example.test/?kind=reports')
      );
      expect(response.status).toBe(403);
      expect(reads).toBe(0);
    });
  });
}
