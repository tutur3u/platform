import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('./artifact-billing', () => ({ generateBilledMeetArtifact: vi.fn() }));
vi.mock('./access', async (original) => ({
  ...(await original<object>()),
  meetAiAccess: mocks.access,
}));

import { MEET_CONSENT_NOTICE_VERSION } from '../consent/notice';
import { changeMeetAi } from './sessions';

const id = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-0000000000aa';
const params = { params: Promise.resolve({ wsId: id, meetingId: id }) };
const start = () =>
  new Request('https://meet.tuturuuu.com/x', {
    method: 'POST',
    body: JSON.stringify({ action: 'start' }),
  });

function database(consentResult: { error: unknown }) {
  const insert = vi.fn().mockResolvedValue(consentResult);
  const sessionInsert = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: { id: sessionId }, error: null }),
  };
  sessionInsert.insert.mockReturnValue(sessionInsert);
  sessionInsert.select.mockReturnValue(sessionInsert);
  const db = {
    from: vi.fn(() => sessionInsert),
    schema: vi.fn(() => ({ from: vi.fn(() => ({ insert })) })),
  };
  mocks.access.mockResolvedValue({
    db,
    meetingId: id,
    wsId: id,
    user: { id },
    meetingStartedAt: null,
  });
  return insert;
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test';
});

describe('starting a transcription session', () => {
  it('records the host allow under the current notice version', async () => {
    const insert = database({ error: null });
    expect(await changeMeetAi(start(), params)).toEqual({ sessionId });
    expect(insert).toHaveBeenCalledWith({
      session_id: sessionId,
      user_id: id,
      decision: 'allow',
      notice_version: MEET_CONSENT_NOTICE_VERSION,
    });
  });

  it('still starts when the consent log is unavailable (host exemption)', async () => {
    const insert = database({ error: { code: 'PGRST205' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await changeMeetAi(start(), params)).toEqual({ sessionId });
    expect(insert).toHaveBeenCalledOnce();
  });
});
