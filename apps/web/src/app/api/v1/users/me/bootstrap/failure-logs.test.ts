/**
 * Runs the real section readers while their sections fail on paths whose
 * individual-route logs carry the user id, the email or a raw database error,
 * and proves the bootstrap itself logs section names and error codes only.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeQuery } from '@/lib/current-user/test-support';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const ACTOR_EMAIL = 'actor.private@example.test';
const WS = '00000000-0000-4000-8000-0000000000aa';

const RAW_PROFILE_ERROR = {
  code: 'RAW_PROFILE_CODE',
  message: `raw profile failure for ${ACTOR_EMAIL}`,
};
const RAW_WORKSPACE_ERROR = {
  code: 'RAW_WORKSPACE_CODE',
  message: `raw workspace failure for ${WS}`,
};
const RAW_CONFIG_ERROR = {
  code: 'RAW_CONFIG_CODE',
  message: 'raw config failure',
};
const INVITATION_FAILURE = `raw invitation failure for ${ACTOR_EMAIL}`;

const h = vi.hoisted(() => ({
  invitations: vi.fn(),
}));

/** A query whose awaited result never settles, so its section times out. */
function hangingQuery() {
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') return () => {};
        return () => builder;
      },
    }
  );
  return builder;
}

function from(table: string) {
  switch (table) {
    case 'users':
      return fakeQuery({
        data: { created_at: 'c', display_name: 'Actor', id: ACTOR },
        error: null,
      });
    case 'user_private_details':
      return fakeQuery({ data: null, error: RAW_PROFILE_ERROR });
    case 'workspaces':
      return fakeQuery({ data: null, error: RAW_WORKSPACE_ERROR });
    case 'user_configs':
      return fakeQuery({ data: null, error: RAW_CONFIG_ERROR });
    case 'onboarding_progress':
      return hangingQuery();
    default:
      throw new Error(`Unexpected table: ${table}`);
  }
}

vi.mock('next/server', async () => ({
  ...(await vi.importActual('next/server')),
  connection: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) =>
      handler(request, {
        supabase: { from },
        user: { email: ACTOR_EMAIL, id: ACTOR },
      }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from }),
  createDynamicAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => {
  class WorkspaceNotFoundError extends Error {}
  return {
    isWorkspaceUuidLiteral: (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value
      ),
    normalizeWorkspaceId: async (id: string) => id,
    verifyWorkspaceMembershipType: vi.fn(),
    WorkspaceNotFoundError,
  };
});
vi.mock('@tuturuuu/tasks-api/server/board-access', () => ({
  loadTaskBoardGuestSharesForWorkspace: async () => ({ count: 0 }),
  summarizeTaskBoardGuestShares: () => ({
    boardCount: 0,
    highestPermission: 'view',
    landingPath: '/tasks',
  }),
}));
vi.mock('@/lib/workspace-invitations/status', () => ({
  listPendingWorkspaceInvitations: h.invitations,
}));
vi.mock('@/legacy-api-routes/v1/notifications/access', () => ({
  buildNotificationAccessFilter: vi.fn(),
  getNotificationAccessContext: vi.fn(),
}));
vi.mock('@tuturuuu/ui/lib/workspace-actions', () => ({
  fetchWorkspaceSummaries: vi.fn(),
}));

import { BOOTSTRAP_SECTION_DEADLINE_MS } from './sections';
import { GET } from './route';

/** Serialises every argument deeply, including Error name, message and stack. */
function deepString(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    entry instanceof Error
      ? { message: entry.message, name: entry.name, stack: entry.stack }
      : entry
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.invitations.mockRejectedValue(new Error(INVITATION_FAILURE));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('bootstrap failure logs', () => {
  it('record section names and codes only while sections fail', async () => {
    const pending = GET(
      new NextRequest(
        `https://example.test/api/v1/users/me/bootstrap?expectedActorId=${ACTOR}` +
          `&sections=profile,workspace,configs,onboarding,invitations` +
          `&configs=SORBET_THEME&wsId=${WS}`
      ),
      undefined as never
    );
    await vi.advanceTimersByTimeAsync(BOOTSTRAP_SECTION_DEADLINE_MS + 1);
    const response = await pending;
    expect(response.status).toBe(200);

    // Every section failed on a path whose individual route logs identifiers.
    const body = await response.json();
    expect(body.sections.profile.error).toEqual({
      code: 'failed',
      status: 500,
    });
    expect(body.sections.workspace.error).toEqual({
      code: 'failed',
      status: 500,
    });
    expect(body.sections.configs.SORBET_THEME.error).toEqual({
      code: 'failed',
      status: 500,
    });
    expect(body.sections.invitations.error).toEqual({
      code: 'failed',
      status: 500,
    });
    expect(body.sections.onboarding.error).toEqual({
      code: 'timeout',
      status: 504,
    });

    const calls = vi.mocked(console.error).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('[user-bootstrap] section failures');
    const entries = calls[0]?.[1] as string[];
    expect([...entries].sort()).toEqual([
      'configs.SORBET_THEME:failed',
      'invitations:failed',
      'onboarding:timeout',
      'profile:failed',
      'workspace:failed',
    ]);
    for (const entry of entries) {
      expect(entry).toMatch(/^[A-Za-z]+(\.[A-Z_]+)?:[a-z_]+$/);
    }

    const logged = calls
      .map((call) => call.map(deepString).join(' '))
      .join(' ');
    for (const forbidden of [
      ACTOR,
      ACTOR_EMAIL,
      'actor.private',
      WS,
      RAW_PROFILE_ERROR.code,
      RAW_PROFILE_ERROR.message,
      RAW_WORKSPACE_ERROR.code,
      RAW_WORKSPACE_ERROR.message,
      RAW_CONFIG_ERROR.code,
      RAW_CONFIG_ERROR.message,
      INVITATION_FAILURE,
      'userId',
      'Error fetching user profile',
      'Error fetching user private profile details',
      'Failed to list workspace invitations',
      'WORKSPACE_INVITATIONS_LOOKUP_FAILED',
      'Error fetching workspaces',
      'Error fetching user config',
      'message',
      'stack',
    ]) {
      expect(logged).not.toContain(forbidden);
    }
  });
});
