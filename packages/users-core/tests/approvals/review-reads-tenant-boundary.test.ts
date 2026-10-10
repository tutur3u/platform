import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

import { GET as contactsSummary } from '../../../../apps/contacts/src/app/api/v1/workspaces/[wsId]/settings/approvals/pending-summary/route';
import { GET as webSummary } from '../../../../apps/web/src/app/api/v1/workspaces/[wsId]/settings/approvals/pending-summary/implementation';
import { GET as webLogs } from '../../../../apps/web/src/app/api/v1/workspaces/[wsId]/users/approvals/logs/implementation';
import { handleGetApprovalLogsRequest } from '../../src/routes/users/approvals/logs';

const ws = 'workspace-1';
const actor = { id: 'actor-1', email: 'approver@example.test' };
const context = { params: Promise.resolve({ wsId: ws }) };
const row = (id: string, user = ws, group: string | null = ws) => ({
  id,
  report_id: 'report-1',
  user_ws_id: user,
  group_ws_id: group,
  report_approval_status: 'PENDING',
});
let reports: ReturnType<typeof row>[];
let allowed: boolean;
let reads: string[];

function query(table: string) {
  reads.push(table);
  const filters: [string, unknown][] = [];
  let head = false;
  let single = false;
  const result = () => {
    if (table === 'user_group_post_checks')
      return { data: [], count: 7, error: null };
    const matching = reports.filter((r) =>
      filters.every(([key, value]) => r[key as keyof typeof r] === value)
    );
    return {
      data: head ? null : single ? (matching[0] ?? null) : matching,
      count: matching.length,
      error: null,
    };
  };
  const q = {
    select: (_columns: string, opts?: { head?: boolean }) => {
      head = !!opts?.head;
      return q;
    },
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return q;
    },
    order: () => q,
    limit: () => q,
    maybeSingle: () => {
      single = true;
      return q;
    },
    // biome-ignore lint/suspicious/noThenProperty: emulate the real lazy PostgREST query contract.
    then: (resolve: (v: ReturnType<typeof result>) => unknown) =>
      Promise.resolve(result()).then(resolve),
  };
  return q;
}
beforeEach(() => {
  vi.clearAllMocks();
  reports = [
    row('own'),
    row('foreign-group', ws, 'workspace-2'),
    row('null-group', ws, null),
    row('foreign-subject', 'workspace-2'),
  ];
  reads = [];
  allowed = true;
  mocks.createAdminClient.mockResolvedValue({
    schema: () => ({ from: query }),
  });
  mocks.createClient.mockResolvedValue({});
  mocks.getPermissions.mockImplementation(async () => ({
    wsId: ws,
    containsPermission: () => allowed,
    withoutPermission: () => !allowed,
  }));
  mocks.normalizeWorkspaceId.mockResolvedValue(ws);
  mocks.getSatelliteAppSessionUser.mockResolvedValue(actor);
  mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
    user: actor,
    authError: null,
  });
  mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
});
for (const [name, get] of [
  ['Contacts', contactsSummary],
  ['Web', webSummary],
] as const) {
  describe(`${name} pending summary tenancy`, () => {
    it('counts own subject AND group only, retaining independent daily count', async () => {
      const response = await get(new Request('https://example.test'), context);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        pending: { reports: 1, posts: 7 },
      });
    });
    it('denies permission before private reads', async () => {
      allowed = false;
      expect(
        (await get(new Request('https://example.test'), context)).status
      ).toBe(403);
      expect(reads).toEqual([]);
    });
  });
}
for (const [name, get] of [
  [
    'Contacts',
    (request: Request) => handleGetApprovalLogsRequest(request, context, actor),
  ],
  ['Web', (request: Request) => webLogs(request, context)],
] as const) {
  describe(`${name} approved log tenancy`, () => {
    for (const group of ['workspace-2', null]) {
      it(`does not expose approved history for group ${group}`, async () => {
        reports = [
          { ...row('log', ws, group), report_approval_status: 'APPROVED' },
        ];
        const response = await get(
          new Request('https://example.test/?kind=reports&reportId=report-1')
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toBeNull();
      });
    }
    it('retains own approved history and excludes foreign subject', async () => {
      reports = [{ ...row('own-log'), report_approval_status: 'APPROVED' }];
      const response = await get(
        new Request('https://example.test/?kind=reports&reportId=report-1')
      );
      expect(await response.json()).toMatchObject({ id: 'own-log' });
      reports = [
        {
          ...row('foreign-log', 'workspace-2'),
          report_approval_status: 'APPROVED',
        },
      ];
      expect(
        await (
          await get(
            new Request('https://example.test/?kind=reports&reportId=report-1')
          )
        ).json()
      ).toBeNull();
    });
    it('denies permission before log reads', async () => {
      allowed = false;
      expect(
        (
          await get(
            new Request('https://example.test/?kind=reports&reportId=report-1')
          )
        ).status
      ).toBe(403);
      expect(reads).toEqual([]);
    });
  });
}
