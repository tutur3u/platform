import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const authMocks = vi.hoisted(() => ({
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: authMocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/utils/workspace-helper')
  >()),
  normalizeWorkspaceId: authMocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: authMocks.verifyWorkspaceMembershipType,
}));

import {
  buildTaskPlanDigest,
  isTaskPlanSchemaUnavailableError,
  planShareCreateSchema,
  resolveTaskPlanRouteAuth,
  taskPlanRouteErrorResponse,
} from './_utils';

describe('task plan route utilities', () => {
  it('authorizes membership with the resolved app-session client', async () => {
    const sessionClient = { name: 'app-session-client' };
    const request = new Request(
      'https://tasks.tuturuuu.com/api/v1/workspaces/personal/task-plans'
    );
    authMocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      supabase: sessionClient,
      user: { id: 'user-1' },
    });
    authMocks.normalizeWorkspaceId.mockResolvedValue('workspace-1');
    authMocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });

    const result = await resolveTaskPlanRouteAuth(request as never, {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    expect(authMocks.resolveAuthenticatedSessionUser).toHaveBeenCalledWith(
      request
    );
    expect(authMocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
      supabase: sessionClient,
    });
  });

  it('detects missing schema errors from Postgres and PostgREST', () => {
    expect(isTaskPlanSchemaUnavailableError({ code: '42P01' })).toBe(true);
    expect(isTaskPlanSchemaUnavailableError({ code: 'PGRST204' })).toBe(true);
    expect(
      isTaskPlanSchemaUnavailableError({
        message: "Could not find the 'task_plan_items' table",
      })
    ).toBe(true);
    expect(
      isTaskPlanSchemaUnavailableError({
        code: '42501',
        message:
          'new row violates row-level security policy for table "task_plans"',
      })
    ).toBe(false);
    expect(isTaskPlanSchemaUnavailableError({ code: '23505' })).toBe(false);
  });

  it('returns a typed validation response for invalid payloads', async () => {
    const schema = z.object({ title: z.string().min(1) });
    const response = taskPlanRouteErrorResponse(
      schema.safeParse({ title: '' }).error,
      'Failed'
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: expect.any(String),
    });
  });

  it('requires exactly one share recipient', () => {
    expect(
      planShareCreateSchema.safeParse({
        shared_with_email: 'lead@example.com',
      }).success
    ).toBe(true);
    expect(
      planShareCreateSchema.safeParse({
        shared_with_email: 'lead@example.com',
        shared_with_user_id: '00000000-0000-4000-8000-000000000001',
      }).success
    ).toBe(false);
  });

  it('builds a sorted digest from source tasks and draft snapshots', () => {
    const digest = buildTaskPlanDigest({
      plan: {
        title: 'Weekly launch',
        period_start: '2026-06-22',
        period_end: '2026-06-28',
      },
      items: [
        {
          planned_start: '2026-06-24',
          sort_key: 20,
          snapshot_title: 'Draft retrospective',
        },
        {
          planned_start: '2026-06-23',
          sort_key: 10,
          task: { name: 'Ship planner' },
          target_ws_id: 'team-ws',
        },
      ],
    });

    expect(digest).toContain('# Weekly launch');
    expect(digest.indexOf('## 2026-06-23')).toBeLessThan(
      digest.indexOf('## 2026-06-24')
    );
    expect(digest).toContain('- Ship planner (team-ws)');
    expect(digest).toContain('- Draft retrospective');
  });
});
