import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real meetAiAccess and transcribeMeetChunk; only the outer services are doubles.
const mocks = vi.hoisted(() => ({
  cloudflare: vi.fn(),
  user: vi.fn(),
  from: vi.fn(),
  admin: vi.fn(),
  resolve: vi.fn(),
  membership: vi.fn(),
  credits: vi.fn(),
  generate: vi.fn(),
  speaker: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.cloudflare,
}));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  isParleySession: async () => false,
}));
vi.mock('./room-access', () => ({ canReadSharedMeetingNotes: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  resolveWorkspaceIdForPrincipal: mocks.resolve,
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('./credit-admission', () => ({ admitMeetCredits: mocks.credits }));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
}));
vi.mock('./transcript-speaker', () => ({
  resolveTranscriptSpeaker: mocks.speaker,
}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));

import { meetAiResponse } from './access';
import { transcribeMeetChunk } from './chunks';

const meetingId = '00000000-0000-4000-8000-000000000001';
const listed = '00000000-0000-4000-8000-0000000000aa';
const unlisted = '00000000-0000-4000-8000-0000000000bb';
const params = (wsId: string) => ({
  params: Promise.resolve({ wsId, meetingId }),
});
const upload = () => {
  const body = new FormData();
  body.set('sessionId', meetingId);
  body.set('id', meetingId);
  body.set('sequence', '0');
  body.set('startSeconds', '0');
  body.set('audio', new Blob([new Uint8Array(64)], { type: 'audio/wav' }));
  return new Request(
    `https://meet.tuturuuu.com/api/meet-ai/x/${meetingId}/chunks`,
    {
      method: 'POST',
      headers: { origin: 'https://meet.tuturuuu.com' },
      body,
    }
  );
};
const bind = (value?: string) =>
  mocks.cloudflare.mockResolvedValue({
    env: { MEET_AI_ENABLED_WORKSPACE_IDS: value },
  });

describe('chunk upload workspace gate (real access path)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: 'actor' });
    mocks.admin.mockResolvedValue({ from: mocks.from });
    mocks.resolve.mockImplementation(async ({ wsId }) =>
      wsId === 'personal' ? listed : wsId
    );
    mocks.membership.mockResolvedValue({ ok: true });
  });

  it.each([
    ['unset', undefined],
    ['blank', ''],
    ['not listed', listed],
  ])(
    'denies %s with zero database writes and zero provider calls',
    async (_label, allowlist) => {
      bind(allowlist);
      const response = await meetAiResponse(() =>
        transcribeMeetChunk(upload(), params(unlisted))
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: 'MEET_AI_WORKSPACE_NOT_ENABLED',
      });
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.credits).not.toHaveBeenCalled();
      expect(mocks.generate).not.toHaveBeenCalled();
      expect(mocks.speaker).not.toHaveBeenCalled();
    }
  );

  it('admits a listed workspace past the gate, including a personal lookup', async () => {
    bind(` ${listed} , ${listed}`);
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: null, error: new Error('stop here') }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    for (const wsId of [listed, 'personal']) {
      const response = await meetAiResponse(() =>
        transcribeMeetChunk(upload(), params(wsId))
      );
      // Past the gate the request proceeds to the meeting lookup.
      expect(response.status).toBe(500);
      expect(mocks.from).toHaveBeenCalledWith('workspace_meetings');
    }
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
