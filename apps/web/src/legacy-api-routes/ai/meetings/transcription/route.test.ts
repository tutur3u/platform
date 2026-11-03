// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression for Selene F1 on #7506: a settings manager could re-enable legacy
// transcription by writing the `legacy_meeting_transcription_enabled`
// workspace config through the generic settings API or directly under RLS.
// Both writes land in the same synthetic config store; the route must ignore it.

const { KEY, MEETING_ID, WS_ID, adminClient, configKey, mocks, userClient } =
  vi.hoisted(() => {
    const WS_ID = '11111111-1111-4111-8111-111111111111';
    const mocks = {
      configs: new Map<string, string>(),
      getWorkspaceConfig: vi.fn(),
      generateObject: vi.fn(),
      google: vi.fn(),
    };
    const configKey = (wsId: string, id: string) => `${wsId}:${id}`;
    const configTable = () => ({
      upsert: vi.fn((row: { id: string; ws_id: string; value: string }) => {
        mocks.configs.set(configKey(row.ws_id, row.id), row.value);
        const chain: { eq: () => unknown; error: null } = {
          eq: () => chain,
          error: null,
        };
        return chain;
      }),
    });
    const meetingTable = () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: { ws_id: WS_ID, creator_id: 'creator' },
          error: null,
        }),
      };
      return query;
    };
    const userClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'creator' } } }),
      },
      from: (table: string) =>
        table === 'workspace_configs' ? configTable() : meetingTable(),
    };
    return {
      KEY: 'legacy_meeting_transcription_enabled',
      MEETING_ID: '22222222-2222-4222-8222-222222222222',
      WS_ID,
      adminClient: { from: () => configTable() },
      configKey,
      mocks,
      userClient,
    };
  });

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => userClient,
  createAdminClient: async () => adminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: mocks.getWorkspaceConfig,
  normalizeWorkspaceId: async () => WS_ID,
  verifyWorkspaceMembershipType: async () => ({
    ok: true,
    membershipType: 'MEMBER',
  }),
}));
vi.mock('@/lib/workspace-helper', () => ({
  getWorkspaceConfig: mocks.getWorkspaceConfig,
}));
vi.mock('@tuturuuu/utils/api-proxy-rate-limiters', () => ({
  getRateLimiters: async () => ({
    mutate: [{ limiter: { limit: async () => ({ success: true }) } }],
  }),
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: async () => ({
    context: {
      normalizedWsId: WS_ID,
      permissions: { withoutPermission: () => false },
      sbAdmin: adminClient,
    },
  }),
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: async () => ({}),
}));
vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: vi.fn(),
}));
vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: vi.fn(),
}));
vi.mock('@/lib/workspace-default-included-groups', () => ({
  listWorkspaceDefaultIncludedGroupIds: vi.fn(),
  replaceWorkspaceDefaultIncludedGroupIds: vi.fn(),
}));
vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('@ai-sdk/google', () => ({ google: mocks.google }));

import { PUT as putSetting } from '@/legacy-api-routes/v1/workspaces/[wsId]/settings/[configId]/route';
import { POST as transcribe } from './route';

function transcriptionRequest() {
  const form = new FormData();
  form.set(
    'audio',
    new File(['synthetic audio'], 'recording.webm', { type: 'audio/webm' })
  );
  form.set('wsId', WS_ID);
  form.set('meetingId', MEETING_ID);
  return new Request('https://example.test/api/ai/meetings/transcription', {
    method: 'POST',
    body: form,
  });
}

async function expectRefused() {
  const response = await transcribe(transcriptionRequest());
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    code: 'LEGACY_MEETING_TRANSCRIPTION_DISABLED',
  });
  expect(mocks.google).not.toHaveBeenCalled();
  expect(mocks.generateObject).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configs.clear();
  mocks.getWorkspaceConfig.mockImplementation(
    async (wsId: string, id: string) =>
      mocks.configs.get(configKey(wsId, id)) ?? null
  );
});

describe('legacy transcription ignores the retired workspace config key', () => {
  it('stays refused after a manager enables the key via the generic settings API', async () => {
    const write = await putSetting(
      new Request(`https://example.test/api/v1/workspaces/${WS_ID}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ value: 'true' }),
      }),
      { params: Promise.resolve({ wsId: WS_ID, configId: KEY }) }
    );
    expect(write.status).toBe(200);
    expect(mocks.configs.get(configKey(WS_ID, KEY))).toBe('true');

    await expectRefused();
  });

  it('stays refused after a direct RLS write of the key', async () => {
    userClient
      .from('workspace_configs')
      .upsert({ id: KEY, ws_id: WS_ID, value: 'true' });
    expect(mocks.configs.get(configKey(WS_ID, KEY))).toBe('true');

    await expectRefused();
  });

  it('never consults workspace config for the decision', async () => {
    mocks.configs.set(configKey(WS_ID, KEY), 'true');
    await expectRefused();
    expect(mocks.getWorkspaceConfig).not.toHaveBeenCalled();
  });
});
