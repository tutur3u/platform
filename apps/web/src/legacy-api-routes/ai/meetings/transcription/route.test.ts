import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  providerHandler: vi.fn(),
  createPOST: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  googleProvider: vi.fn(),
  generateText: vi.fn(),
  isMeetAiEnabledOnWeb: vi.fn(),
  limitMeetAiUsageOnWeb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/ai/meetings/transcription/route', () => ({
  createPOST: mocks.createPOST.mockImplementation(() => mocks.providerHandler),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@ai-sdk/google', () => ({
  google: mocks.googleProvider,
  createGoogleGenerativeAI: mocks.googleProvider,
}));
vi.mock('ai', () => ({ generateText: mocks.generateText }));
vi.mock('../transcription/meet-ai-gate', () => ({
  isMeetAiEnabledOnWeb: mocks.isMeetAiEnabledOnWeb,
}));
vi.mock('../transcription/meet-ai-usage-limit', () => ({
  limitMeetAiUsageOnWeb: mocks.limitMeetAiUsageOnWeb,
}));

const MEET_AI_ENV = [
  'MEET_AI_DISABLED',
  'MEET_AI_DISABLED_WORKSPACE_IDS',
  'MEET_AI_ENABLED_WORKSPACE_IDS',
] as const;
const WS = '11111111-1111-4111-8111-111111111111';

function postRequest() {
  return new Request('http://localhost/api/ai/meetings/transcription', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wsId: WS, meetingId: 'm1', text: 'hello' }),
  });
}

async function expectDisabled() {
  const { POST } = await import('./route');
  const response = await POST(postRequest() as never);
  expect(response.status).toBe(403);
  const body = await response.json();
  expect(body.code).toBe('LEGACY_MEETING_AI_DISABLED');
  expect(typeof body.error).toBe('string');
  expect(body.error.length).toBeGreaterThan(0);
  for (const mock of Object.values(mocks)) {
    expect(mock).not.toHaveBeenCalled();
  }
}

describe('legacy web meeting transcription POST', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 403 without touching auth, Supabase, usage or the provider when MEET_AI_* env is unset', async () => {
    for (const name of MEET_AI_ENV) vi.stubEnv(name, undefined);
    await expectDisabled();
  });

  it('returns 403 even when MEET_AI_* env allows every workspace', async () => {
    vi.stubEnv('MEET_AI_DISABLED', '0');
    vi.stubEnv('MEET_AI_DISABLED_WORKSPACE_IDS', undefined);
    vi.stubEnv('MEET_AI_ENABLED_WORKSPACE_IDS', WS);
    await expectDisabled();
  });
});
