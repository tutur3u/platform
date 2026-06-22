import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceTaskPlan,
  createWorkspaceTaskPlanItem,
  createWorkspaceTaskPlanShare,
  getWorkspaceTaskPlanDigest,
  isTaskPlanSchemaUnavailable,
  listWorkspaceTaskPlans,
} from './task-plans';

describe('task plan internal API helpers', () => {
  it('lists plans with filters and preserves client options', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, schemaAvailable: true, plans: [] }),
    });

    await listWorkspaceTaskPlans(
      'ws 1',
      { period_type: 'week', status: 'draft' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws%201/task-plans?period_type=week&status=draft',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });

  it('creates plans, source-backed items, shares, and digests on stable paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, schemaAvailable: true }),
    });
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as typeof fetch,
    };

    await createWorkspaceTaskPlan(
      'ws-1',
      {
        title: 'Week plan',
        period_type: 'week',
        period_start: '2026-06-22',
        period_end: '2026-06-28',
        intended_workspace_ids: ['team-ws'],
      },
      options
    );
    await createWorkspaceTaskPlanItem(
      'ws-1',
      'plan-1',
      {
        target_ws_id: 'team-ws',
        target_list_id: 'list-1',
        snapshot_title: 'Ship planner',
        source_task: { name: 'Ship planner', listId: 'list-1' },
      },
      options
    );
    await createWorkspaceTaskPlanShare(
      'ws-1',
      'plan-1',
      { shared_with_email: 'lead@example.com', permission: 'view' },
      options
    );
    await getWorkspaceTaskPlanDigest('ws-1', 'plan-1', options);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://internal.example.com/api/v1/workspaces/ws-1/task-plans',
      'https://internal.example.com/api/v1/workspaces/ws-1/task-plans/plan-1/items',
      'https://internal.example.com/api/v1/workspaces/ws-1/task-plans/plan-1/shares',
      'https://internal.example.com/api/v1/workspaces/ws-1/task-plans/plan-1/digest',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual(
      expect.objectContaining({
        source_task: { name: 'Ship planner', listId: 'list-1' },
      })
    );
  });

  it('identifies rollout-safe schema unavailable responses', () => {
    expect(
      isTaskPlanSchemaUnavailable({
        ok: false,
        code: 'schema_unavailable',
        schemaAvailable: false,
        message: 'migration pending',
      })
    ).toBe(true);
    expect(isTaskPlanSchemaUnavailable({ ok: true })).toBe(false);
  });
});
