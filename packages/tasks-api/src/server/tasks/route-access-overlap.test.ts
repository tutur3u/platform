import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  USER_ID,
  mocks,
  queueResult,
  resetTaskRouteFixtures,
} from './task-route.test-fixture';

async function loadGetTasks() {
  const { handleTaskRouteGET } = await import('./route.js');
  return () =>
    handleTaskRouteGET(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/tasks'),
      { params: Promise.resolve({ wsId: 'ws-1' }) },
      {
        supabase: mocks.memberClient as never,
        user: { email: 'member@example.com', id: USER_ID } as never,
      }
    );
}

describe('workspace task route access overlap', () => {
  beforeEach(resetTaskRouteFixtures);

  it('loads the workspace row while membership is still resolving', async () => {
    let resolveMembership!: (value: { ok: boolean }) => void;
    mocks.verifyWorkspaceMembershipType.mockReturnValue(
      new Promise((resolve) => {
        resolveMembership = resolve;
      })
    );
    queueResult(mocks.adminQueues, 'workspaces', {
      data: { personal: false },
      error: null,
    });
    queueResult(mocks.adminQueues, 'tasks', {
      count: 0,
      data: [],
      error: null,
    });

    const getTasks = await loadGetTasks();
    const pending = getTasks();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.adminClient.from).toHaveBeenCalledWith('workspaces');
    expect(mocks.adminClient.from).not.toHaveBeenCalledWith('tasks');

    resolveMembership({ ok: true });
    expect((await pending).status).toBe(200);
  });

  it('still denies a non-member before the workspace row is read', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_missing',
      ok: false,
    });
    queueResult(mocks.adminQueues, 'workspaces', {
      data: null,
      error: { message: 'workspace lookup failed' },
    });

    const response = await (await loadGetTasks())();

    expect(response.status).toBe(403);
    expect(mocks.adminClient.from).not.toHaveBeenCalledWith('tasks');
  });

  it('still answers a membership lookup failure with 500', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_lookup_failed',
      ok: false,
    });

    const response = await (await loadGetTasks())();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to verify workspace membership',
    });
  });
});
