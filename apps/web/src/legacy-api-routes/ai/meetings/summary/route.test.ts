import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPOST: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  googleProvider: vi.fn(),
  generateText: vi.fn(),
  isMeetAiEnabledOnWeb: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/ai/meetings/summary/route', () => ({
  createPOST: mocks.createPOST,
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

const WS = '11111111-1111-4111-8111-111111111111';

async function expectDisabled() {
  const { POST } = await import('./route');
  const response = await POST(
    new Request('http://localhost/api/ai/meetings/summary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wsId: WS, meetingId: 'm1', text: 'hello' }),
    })
  );
  expect(response.status).toBe(403);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const body = await response.json();
  expect(body.code).toBe('LEGACY_MEETING_AI_DISABLED');
  expect(body.error.length).toBeGreaterThan(0);
  for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
}

describe('legacy web meeting summary POST', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns 403 before any work when MEET_AI_* env is unset', async () => {
    for (const name of [
      'MEET_AI_DISABLED',
      'MEET_AI_DISABLED_WORKSPACE_IDS',
      'MEET_AI_ENABLED_WORKSPACE_IDS',
    ])
      vi.stubEnv(name, undefined);
    await expectDisabled();
  });

  it('returns 403 even when MEET_AI_* env allowlists the workspace', async () => {
    vi.stubEnv('MEET_AI_DISABLED', '0');
    vi.stubEnv('MEET_AI_ENABLED_WORKSPACE_IDS', WS);
    await expectDisabled();
  });
});
