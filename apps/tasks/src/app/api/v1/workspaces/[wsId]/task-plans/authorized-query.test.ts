import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolveAuth: vi.fn() }));
vi.mock('./_utils', async (original) => ({
  ...(await original<typeof import('./_utils')>()),
  resolveTaskPlanRouteAuth: mocks.resolveAuth,
}));

import { getAccessibleTaskPlanIds } from './authorized-query';
import { GET } from './route';

const actor = 'actor-a';
const fixture = {
  task_plans: [
    {
      id: 'owned',
      owner_id: actor,
      period_start: '2026-01-01',
      created_at: '2026-01-01',
    },
    {
      id: 'foreign',
      owner_id: 'actor-b',
      period_start: '2026-01-01',
      created_at: '2026-01-01',
    },
    {
      id: 'direct-editor',
      owner_id: 'actor-b',
      period_start: '2026-01-01',
      created_at: '2026-01-01',
    },
    {
      id: 'email-viewer',
      owner_id: 'actor-b',
      period_start: '2026-01-01',
      created_at: '2026-01-01',
    },
    {
      id: 'workspace-viewer',
      owner_id: 'actor-b',
      period_start: '2026-01-01',
      created_at: '2026-01-01',
    },
  ],
  workspace_members: [
    { ws_id: 'tenant-a', user_id: actor, type: 'MEMBER' },
    { ws_id: 'tenant-b', user_id: actor, type: 'GUEST' },
    { ws_id: 'tenant-b', user_id: 'actor-b', type: 'MEMBER' },
  ],
  user_private_details: [{ user_id: actor, email: ' Actor@Example.com ' }],
  task_plan_items: [
    { plan_id: 'foreign', id: 'foreign-item' },
    { plan_id: 'owned', id: 'owned-item' },
  ],
  task_plan_workspaces: [
    { plan_id: 'foreign', ws_id: 'tenant-b' },
    { plan_id: 'owned', ws_id: 'tenant-a' },
  ],
  task_plan_shares: [
    {
      plan_id: 'direct-editor',
      shared_with_user_id: actor,
      permission: 'edit',
    },
    {
      plan_id: 'email-viewer',
      shared_with_email: 'actor@example.com',
      permission: 'view',
    },
    {
      plan_id: 'workspace-viewer',
      shared_with_ws_id: 'tenant-a',
      permission: 'view',
    },
    { plan_id: 'foreign', shared_with_ws_id: 'tenant-b', permission: 'edit' },
  ],
};

// Deliberately no RLS: this models the app-session service-role query boundary.
function client(tables = fixture, sessionRls = false) {
  return {
    from(table: keyof typeof fixture) {
      let rows: Record<string, unknown>[] = tables[table];
      if (sessionRls && table.startsWith('task_plan')) {
        const accessible = [
          'owned',
          'direct-editor',
          'email-viewer',
          'workspace-viewer',
        ];
        rows = rows.filter((row) =>
          accessible.includes(
            String(table === 'task_plans' ? row.id : row.plan_id)
          )
        );
      }
      const query = {
        select: () => query,
        order: () => query,
        range: (from: number, to: number) => {
          rows = rows.slice(from, to + 1);
          return query;
        },
        eq: (key: string, value: unknown) => {
          rows = rows.filter((row) => row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          rows = rows.filter((row) => values.includes(row[key]));
          return query;
        },
        maybeSingle: () => Promise.resolve({ data: rows[0], error: null }),
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
        then: (resolve: (result: unknown) => unknown) =>
          Promise.resolve({ data: rows.slice(0, 1000), error: null }).then(
            resolve
          ),
      };
      return query;
    },
  };
}

describe('actor-scoped plans with two synthetic tenants', () => {
  it('includes owned, direct editor, database email, and member-workspace shares only', async () => {
    const ids = await getAccessibleTaskPlanIds({
      sbAdmin: client(),
      user: { id: actor, email: 'forged@example.com' },
    } as never);
    expect(ids.sort()).toEqual([
      'direct-editor',
      'email-viewer',
      'owned',
      'workspace-viewer',
    ]);
    expect(ids).not.toContain('foreign');
  });
  it('revocation removes shared access without removing ownership', async () => {
    const ids = await getAccessibleTaskPlanIds({
      sbAdmin: client({ ...fixture, task_plan_shares: [] }),
      user: { id: actor },
    } as never);
    expect(ids).toEqual(['owned']);
  });
  it('returns no candidates for an actor with no access', async () => {
    expect(
      await getAccessibleTaskPlanIds({
        sbAdmin: client(),
        user: { id: 'stranger' },
      } as never)
    ).toEqual([]);
  });
  it('fails closed on a membership lookup failure', async () => {
    const error = new Error('membership unavailable');
    const failing = {
      from: () => {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          range: () => q,
          maybeSingle: () => q,
          // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are thenable.
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ error }).then(resolve),
        };
        return q;
      },
    };
    await expect(
      getAccessibleTaskPlanIds({
        sbAdmin: failing,
        user: { id: actor },
      } as never)
    ).rejects.toBe(error);
  });
});

it.each(['app-session-admin', 'ordinary-session'])(
  'lists and hydrates only accessible plans using %s',
  async (sessionKind) => {
    const db = client();
    mocks.resolveAuth.mockResolvedValue({
      sbAdmin: db,
      supabase: client(fixture, sessionKind === 'ordinary-session'),
      user: { id: actor },
      wsId: 'tenant-a',
    });
    const response = await GET(
      new Request(
        'https://tasks.example/api/v1/workspaces/tenant-a/task-plans'
      ) as never,
      { params: Promise.resolve({ wsId: 'tenant-a' }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plans.map((plan: { id: string }) => plan.id).sort()).toEqual([
      'direct-editor',
      'email-viewer',
      'owned',
      'workspace-viewer',
    ]);
    expect(JSON.stringify(body)).not.toContain('foreign');
    expect(
      body.plans.find((plan: { id: string }) => plan.id === 'owned').items
    ).toEqual([{ plan_id: 'owned', id: 'owned-item' }]);
  }
);

it('retains a filtered plan beyond 1,000 actor-owned candidates', async () => {
  const plans = Array.from({ length: 1001 }, (_, index) => ({
    id: `plan-${index}`,
    owner_id: actor,
    period_start: '2026-01-01',
    created_at: '2026-01-01',
    status: index === 1000 ? 'active' : 'archived',
  }));
  const db = client({ ...fixture, task_plans: plans, task_plan_shares: [] });
  mocks.resolveAuth.mockResolvedValue({
    sbAdmin: db,
    supabase: db,
    user: { id: actor },
    wsId: 'tenant-a',
  });
  const response = await GET(
    new Request(
      'https://tasks.example/api/v1/workspaces/tenant-a/task-plans?status=active'
    ) as never,
    { params: Promise.resolve({ wsId: 'tenant-a' }) }
  );
  expect(response.status).toBe(200);
  expect(
    (await response.json()).plans.map((plan: { id: string }) => plan.id)
  ).toEqual(['plan-1000']);
});
