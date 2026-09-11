import { afterEach, expect, it, vi } from 'vitest';
import { liveRoomCommand } from '../../../cloudflare/live/room';
import {
  type LiveEnvironment,
  liveDatabase,
} from '../../../cloudflare/live/storage';
import type { LiveSessionClaims } from './contracts';

const env = {
  MEET_REALTIME_URL: 'https://realtime.example.test/realtime',
  MEET_REALTIME_TOKEN_SECRET: 'test-secret',
  NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.test',
  SUPABASE_SECRET_KEY: 'test-database-secret',
} as LiveEnvironment;
const claims = {
  sessionId: 'session',
  ownerId: '11111111-1111-4111-8111-111111111111',
  meetingId: '22222222-2222-4222-8222-222222222222',
  mode: 'room',
} as LiveSessionClaims;
const identity = {
  workspaceId: '33333333-3333-4333-8333-333333333333',
  isHost: true,
  displayName: 'Test host',
};
afterEach(() => vi.unstubAllGlobals());

it.each(['room', 'database'] as const)(
  'uses workerd-compatible requests for %s',
  async (target) => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.redirect === 'error')
        throw new TypeError('Unsupported redirect mode');
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', fetcher);
    const result =
      target === 'room'
        ? await liveRoomCommand(env, claims, identity, {
            action: 'live.context',
          })
        : await liveDatabase(env, 'meet_ai_user_preferences');
    expect(result).toEqual({ ok: true });
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('manual');
  }
);

it.each([301, 302, 307, 308])(
  'rejects HTTP %s without forwarding server credentials',
  async (status) => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status,
          headers: { Location: 'https://untrusted.example.test' },
        })
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(liveRoomCommand(env, claims, identity, {})).rejects.toThrow(
      `live_room_${status}`
    );
    await expect(liveDatabase(env, 'meet_ai_user_preferences')).rejects.toThrow(
      `live_database_${status}`
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const call of fetcher.mock.calls as unknown as Array<
      [unknown, RequestInit]
    >) {
      expect(call[1].redirect).toBe('manual');
    }
  }
);
