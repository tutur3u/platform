import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { describe, expect, it, vi } from 'vitest';
import { resolveMiraTimezone } from './mira-timezone';

type Row = { timezone: string | null } | null;

function supabaseWith({
  user = null,
  workspace = null,
  userError,
}: {
  user?: Row;
  workspace?: Row;
  userError?: Error;
}) {
  const from = vi.fn((table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () =>
          table === 'user_private_details'
            ? { data: user, error: userError ?? null }
            : { data: workspace, error: null },
      }),
    }),
  }));
  return { client: { from } as unknown as TypedSupabaseClient, from };
}

describe('resolveMiraTimezone', () => {
  it('prefers a valid client timezone without reading preferences', async () => {
    const { client, from } = supabaseWith({});
    await expect(
      resolveMiraTimezone({
        requestTimezone: 'Asia/Ho_Chi_Minh',
        supabase: client,
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).resolves.toEqual({ source: 'request', timezone: 'Asia/Ho_Chi_Minh' });
    expect(from).not.toHaveBeenCalled();
  });

  it('falls back to the saved personal timezone when the client omits it', async () => {
    const { client } = supabaseWith({ user: { timezone: 'Asia/Bangkok' } });
    await expect(
      resolveMiraTimezone({ supabase: client, userId: 'user-1', wsId: 'ws-1' })
    ).resolves.toEqual({ source: 'user', timezone: 'Asia/Bangkok' });
  });

  it('ignores invalid and auto values and uses the workspace timezone', async () => {
    const { client } = supabaseWith({
      user: { timezone: 'auto' },
      workspace: { timezone: 'Europe/Berlin' },
    });
    await expect(
      resolveMiraTimezone({
        requestTimezone: 'Not/AZone',
        supabase: client,
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).resolves.toEqual({ source: 'workspace', timezone: 'Europe/Berlin' });
  });

  it('continues to the workspace when the personal read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = supabaseWith({
      userError: new Error('unavailable'),
      workspace: { timezone: 'Asia/Tokyo' },
    });
    await expect(
      resolveMiraTimezone({ supabase: client, userId: 'user-1', wsId: 'ws-1' })
    ).resolves.toEqual({ source: 'workspace', timezone: 'Asia/Tokyo' });
    warn.mockRestore();
  });

  it('reports none so executors keep their UTC fallback', async () => {
    const { client } = supabaseWith({
      user: { timezone: null },
      workspace: { timezone: 'auto' },
    });
    await expect(
      resolveMiraTimezone({ supabase: client, userId: 'user-1', wsId: 'ws-1' })
    ).resolves.toEqual({ source: 'none' });
  });
});
