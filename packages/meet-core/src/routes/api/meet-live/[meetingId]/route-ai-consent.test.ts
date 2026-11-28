import { beforeEach, expect, it, vi } from 'vitest';
import { actorId, f, meetingId, sessionId } from './phase-a-fixture';
import { POST as live } from './route';

const consent = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/ai-data-consent-store', () => ({
  AI_DATA_CONSENT_POLICY_VERSION: '2026-11-28',
  lookupAiDataConsent: consent.lookup,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@opennextjs/cloudflare', async () =>
  (await import('./phase-a-fixture')).phaseAModules.cloudflare()
);
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', async () =>
  (await import('./phase-a-fixture')).phaseAModules.callAccess()
);
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', async () =>
  (await import('./phase-a-fixture')).phaseAModules.roomService()
);
vi.mock('../../../../features/live-assistant/server/demo-authority', async () =>
  (await import('./phase-a-fixture')).phaseAModules.demoAuthority()
);
vi.mock('@tuturuuu/meet-core/features/live-assistant/token', async () =>
  (await import('./phase-a-fixture')).phaseAModules.token()
);

const send = (body: unknown, native: boolean) =>
  live(
    new Request(`https://meet.example.test/api/meet-live/${meetingId}`, {
      method: 'POST',
      headers: {
        Origin: 'https://meet.example.test',
        ...(native ? { Authorization: 'Bearer native.supabase.jwt' } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ meetingId }) }
  );
const start = { action: 'start', mode: 'personal', timezone: 'UTC' };

beforeEach(() => {
  consent.lookup.mockReset();
  consent.lookup.mockResolvedValue(false);
});

it('refuses a native start or resume without Mira AI data consent before any Live work', async () => {
  for (const body of [start, { action: 'resume', sessionId }]) {
    const response = await send(body, true);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'ai_consent_required' });
  }
  expect(consent.lookup).toHaveBeenCalledWith(actorId, undefined);
  expect(f.cloudflare).not.toHaveBeenCalled();
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.sign).not.toHaveBeenCalled();
});

it('mints a Live token for a consented native caller', async () => {
  consent.lookup.mockResolvedValue(true);
  const response = await send(start, true);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ token: 'synthetic-token' });
});

it('never looks up consent for a browser session', async () => {
  const response = await send(start, false);
  expect(response.status).toBe(200);
  expect(consent.lookup).not.toHaveBeenCalled();
});

it('lets a native caller without consent stop a session', async () => {
  const response = await send({ action: 'stop', sessionId }, true);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(consent.lookup).not.toHaveBeenCalled();
});
