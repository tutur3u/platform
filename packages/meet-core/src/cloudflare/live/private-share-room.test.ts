import { verifyMeetRealtimeToken } from '@tuturuuu/realtime/meet/token';
import { afterEach, expect, it, vi } from 'vitest';
import { liveSessionClaimsSchema } from '../../features/live-assistant/contracts';
import { liveRoomCommand } from './room';
import { liveTools, READ_SHARED_NOTES_TOOL } from './tools';

const id = 'efaa0c45-4f33-4c6c-9bc8-ae4e65e2b740';
const secret = 'synthetic-test-token-secret';
const env = {
  MEET_REALTIME_TOKEN_SECRET: secret,
  MEET_REALTIME_URL: 'wss://fake-realtime.test',
} as Parameters<typeof liveRoomCommand>[0];
const identity = { isHost: false, workspaceId: id, displayName: 'Learner' };
const claims = (mode: 'personal' | 'room') =>
  liveSessionClaimsSchema.parse({
    audience: 'meet-live',
    app: 'meet',
    billingWorkspaceId: id,
    sessionId: id,
    meetingId: id,
    ownerId: id,
    mode,
    expiresAt: Date.now() + 60_000,
  });

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['personal', true],
  ['room', false],
] as const)(
  'marks only Private Mira room calls as private (%s)',
  async (mode, privateScope) => {
    const transport = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', transport);
    await liveRoomCommand(env, claims(mode), identity, { action: 'read' });
    const [, init] = transport.mock.calls[0] as unknown as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    const token = verifyMeetRealtimeToken(
      String(headers.Authorization).replace('Bearer ', ''),
      secret
    );
    expect(token?.scopes).toContain('meet:live-server');
    expect(token?.scopes.includes('meet:private-mira')).toBe(privateScope);
  }
);

it('drops Mira poll launches and offers shared notes only under the redesign', () => {
  const names = (mode: 'personal' | 'room', uxV2: boolean) =>
    liveTools(mode, false, true, { uxV2 }).map(({ name }) => name);
  expect(names('personal', false)).toContain('launch_poll');
  expect(names('personal', false)).not.toContain(READ_SHARED_NOTES_TOOL);
  expect(names('personal', true)).not.toContain('launch_poll');
  expect(names('personal', true)).toEqual(
    expect.arrayContaining(['draft_poll', READ_SHARED_NOTES_TOOL])
  );
  expect(names('room', true)).not.toContain(READ_SHARED_NOTES_TOOL);
});
