import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolveAuth: vi.fn() }));
vi.mock('./_utils', async (original) => ({
  ...(await original<typeof import('./_utils')>()),
  resolveTaskPlanRouteAuth: mocks.resolveAuth,
}));

import { POST } from './route';

function request() {
  return new Request('https://synthetic.invalid/task-plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Synthetic',
      period_type: 'week',
      period_start: '2026-10-01',
      period_end: '2026-10-07',
    }),
  }) as never;
}
describe('task plan POST personal workspace gate', () => {
  it.each([
    ['missing RPC', { code: 'PGRST202' }, 200, 'schema_unavailable'],
    ['lookup failure', { code: '42501' }, 500, undefined],
    ['nonpersonal workspace', null, 403, undefined],
  ])(
    'fails closed for %s before any insertion',
    async (_label, error, status, code) => {
      const from = vi.fn();
      const rpc = vi.fn().mockResolvedValue({ data: false, error });
      mocks.resolveAuth.mockResolvedValue({
        supabase: { from, rpc },
        user: { id: 'actor-a' },
        wsId: 'tenant-a',
      });
      const response = await POST(request(), {
        params: Promise.resolve({ wsId: 'tenant-a' }),
      });
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(code);
      expect(rpc).toHaveBeenCalledWith('is_task_plan_personal_workspace', {
        p_ws_id: 'tenant-a',
        p_user_id: 'actor-a',
      });
      expect(from).not.toHaveBeenCalled();
    }
  );
});
