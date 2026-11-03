import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  AccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  MeetCallAccessError: mocks.AccessError,
}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.context,
}));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  isParleySession: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import { liveWorkspaceAllowed } from '../../../cloudflare/live/workspace-gate';
import { assertMeetAiRoom } from './room-gate';
import {
  isMeetAiAvailableForWorkspace,
  meetAiAvailable,
} from './workspace-gate';

/**
 * Default-off Meet AI on the Meet Worker's HTTP (meetAiAvailable,
 * isMeetAiAvailableForWorkspace, assertMeetAiRoom) and Live
 * (liveWorkspaceAllowed) gates: every deny control on its own denies, and
 * Easy Center is denied in code even when it is allowlisted.
 */
const EASY_CENTER = '42529372-c669-4833-bb32-2cab1f4ffd83';
const OTHER = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const CONTAINMENT = {
  MEET_AI_DISABLED: 'true',
  MEET_AI_ENABLED_WORKSPACE_IDS: '',
  MEET_AI_DISABLED_WORKSPACE_IDS: EASY_CENTER,
};
const live = (workspaceId: string) => ({
  claims: { app: 'meet' },
  identity: { workspaceId },
});

async function expectDenied(env: object | undefined, wsIds: string[]) {
  mocks.context.mockResolvedValue({ env });
  for (const wsId of wsIds) {
    expect(await meetAiAvailable(wsId)).toBe(false);
    expect(isMeetAiAvailableForWorkspace(wsId, env)).toBe(false);
    expect(liveWorkspaceAllowed(env, live(wsId))).toBe(false);
    await expect(
      assertMeetAiRoom({ meeting: { ws_id: wsId } })
    ).rejects.toMatchObject({ status: 403 });
  }
}

describe('Meet AI default-off gate on the Meet Worker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it.each([
    ['containment deploy env', CONTAINMENT],
    ['missing allowlist (no env)', undefined],
    ['missing allowlist (empty env)', {}],
    ['empty allowlist', { MEET_AI_ENABLED_WORKSPACE_IDS: '' }],
    ["'*' allowlist", { MEET_AI_ENABLED_WORKSPACE_IDS: '*' }],
    [
      'malformed allowlist',
      { MEET_AI_ENABLED_WORKSPACE_IDS: `${OTHER},garbage` },
    ],
    [
      'kill switch',
      { MEET_AI_DISABLED: 'true', MEET_AI_ENABLED_WORKSPACE_IDS: OTHER },
    ],
    [
      'malformed denylist',
      {
        MEET_AI_DISABLED_WORKSPACE_IDS: 'garbage',
        MEET_AI_ENABLED_WORKSPACE_IDS: OTHER,
      },
    ],
  ])('%s denies every workspace on every gate', async (_, env) => {
    await expectDenied(env, [OTHER, EASY_CENTER]);
  });

  it('denies a denylisted workspace even when allowlisted', async () => {
    await expectDenied(
      {
        MEET_AI_ENABLED_WORKSPACE_IDS: OTHER,
        MEET_AI_DISABLED_WORKSPACE_IDS: OTHER,
      },
      [OTHER]
    );
  });

  it('denies Easy Center in code even when it is allowlisted', async () => {
    await expectDenied(
      {
        MEET_AI_DISABLED: 'false',
        MEET_AI_ENABLED_WORKSPACE_IDS: `${EASY_CENTER},${OTHER}`,
      },
      [EASY_CENTER, EASY_CENTER.toUpperCase()]
    );
  });

  it('allows only an explicitly listed workspace on every gate', async () => {
    const env = { MEET_AI_ENABLED_WORKSPACE_IDS: `${EASY_CENTER},${OTHER}` };
    mocks.context.mockResolvedValue({ env });
    expect(await meetAiAvailable(OTHER)).toBe(true);
    expect(isMeetAiAvailableForWorkspace(OTHER, env)).toBe(true);
    expect(liveWorkspaceAllowed(env, live(OTHER))).toBe(true);
    await expect(
      assertMeetAiRoom({ meeting: { ws_id: OTHER } })
    ).resolves.toBeUndefined();
  });

  it('fails closed when the Worker context is unavailable', async () => {
    mocks.context.mockRejectedValue(new Error('no context'));
    expect(await meetAiAvailable(OTHER)).toBe(false);
    await expect(
      assertMeetAiRoom({ meeting: { ws_id: OTHER } })
    ).rejects.toMatchObject({ status: 403 });
  });
});
