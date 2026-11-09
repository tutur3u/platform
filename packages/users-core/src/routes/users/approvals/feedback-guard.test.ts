import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'ws',
  getPermissions: async () => ({ containsPermission: () => true }),
  verifySecret: async () => false,
}));
vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: async () => ({ virtual_user_id: 'actor' }),
}));
import { handlePutApprovalsRequest } from './put';
let rows: {
  id: string;
  feedback: string | null;
  user_ws_id: string;
  group_ws_id: string;
  report_approval_status: string;
}[];
let updated: string[];
beforeEach(() => {
  updated = [];
  rows = [
    {
      id: 'report',
      feedback: 'Teacher comment',
      user_ws_id: 'ws',
      group_ws_id: 'ws',
      report_approval_status: 'PENDING',
    },
  ];
  const from = () => {
    const filters: [string, unknown][] = [];
    let write = false;
    const selected = () =>
      rows.filter((row) =>
        filters.every(([key, value]) => Reflect.get(row, key) === value)
      );
    const result = () => {
      const data = selected();
      if (write) updated.push(...data.map((row) => row.id));
      return { data, error: null };
    };
    const q = {
      select: () => q,
      eq: (key: string, value: unknown) => {
        filters.push([key, value]);
        return q;
      },
      update: () => {
        write = true;
        return q;
      },
      maybeSingle: async () => ({ data: selected()[0] ?? null, error: null }),
      then: (resolve: (v: ReturnType<typeof result>) => unknown) =>
        Promise.resolve(result()).then(resolve),
    };
    return q;
  };
  mocks.admin.mockResolvedValue({ schema: () => ({ from }) });
});
const invoke = (action: 'approve' | 'approveAll') =>
  handlePutApprovalsRequest(
    new Request('https://example.invalid/api', {
      method: 'PUT',
      body: JSON.stringify({
        action,
        kind: 'reports',
        itemId: action === 'approve' ? 'report' : undefined,
      }),
    }),
    { params: Promise.resolve({ wsId: 'ws' }) },
    { id: 'actor' }
  );
it.each([null, '', ' \n\t'])(
  'refuses single approval with empty feedback %j',
  async (feedback) => {
    rows[0]!.feedback = feedback;
    const response = await invoke('approve');
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: 'REPORT_FEEDBACK_REQUIRED',
      messageVi: 'Báo cáo chưa có nhận xét',
    });
    expect(updated).toEqual([]);
  }
);
it('approves a report with feedback', async () => {
  expect((await invoke('approve')).status).toBe(200);
  expect(updated).toEqual(['report']);
});
it('bulk approval skips empty feedback, reports counts and preserves tenant scope', async () => {
  rows.push(
    { ...rows[0]!, id: 'empty', feedback: '  ' },
    { ...rows[0]!, id: 'null', feedback: null },
    { ...rows[0]!, id: 'foreign', group_ws_id: 'foreign' }
  );
  const response = await invoke('approveAll');
  expect(await response.json()).toMatchObject({
    success: true,
    approvedCount: 1,
    skippedEmptyCount: 2,
  });
  expect(updated).toEqual(['report']);
});
