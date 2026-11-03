import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('server-only', () => ({}));
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
 * Containment hotfix (prod line 03a410b3): the deploy env and each control on
 * its own deny Meet AI on the Meet Worker's HTTP and Live paths.
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

describe('Meet AI containment env on the Meet Worker', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ['deploy env', CONTAINMENT],
    ['empty allowlist', { MEET_AI_ENABLED_WORKSPACE_IDS: '' }],
    ['kill switch', { MEET_AI_DISABLED: 'true' }],
  ])('%s denies every workspace on every gate', async (_, env) => {
    mocks.context.mockResolvedValue({ env });
    for (const wsId of [OTHER, EASY_CENTER]) {
      expect(await meetAiAvailable(wsId)).toBe(false);
      expect(isMeetAiAvailableForWorkspace(wsId, env)).toBe(false);
      expect(liveWorkspaceAllowed(env, live(wsId))).toBe(false);
      await expect(
        assertMeetAiRoom({ meeting: { ws_id: wsId } })
      ).rejects.toMatchObject({ status: 403 });
    }
  });

  it('denies Easy Center through the denylist alone', async () => {
    const env = { MEET_AI_DISABLED_WORKSPACE_IDS: EASY_CENTER };
    mocks.context.mockResolvedValue({ env });
    expect(await meetAiAvailable(EASY_CENTER)).toBe(false);
    expect(liveWorkspaceAllowed(env, live(EASY_CENTER))).toBe(false);
    await expect(
      assertMeetAiRoom({ meeting: { ws_id: EASY_CENTER } })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('fails closed when the Worker context is unavailable', async () => {
    mocks.context.mockRejectedValue(new Error('no context'));
    expect(await meetAiAvailable(OTHER)).toBe(false);
  });
});
