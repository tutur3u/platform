import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  getSharedActivity,
  ProfileActivityUnavailable,
} from './workspace-activity';

function client({
  member = true,
  sharing = 'workspace',
  error = null as unknown,
  revoked = false,
} = {}) {
  let reads = 0;
  const queries: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => {
        if (table === 'workspace_members')
          return { data: member ? { user_id: 'subject' } : null, error };
        reads++;
        return {
          data: { value: revoked && reads > 1 ? 'private' : sharing },
          error,
        };
      }),
    };
    queries.push(query);
    return query;
  });
  const rpc = vi.fn().mockResolvedValue({
    data: [
      { today_time: 60, week_time: 120, month_time: 300, daily_activity: [] },
    ],
    error: null,
  });
  return {
    admin: { from, rpc } as unknown as TypedSupabaseClient,
    from,
    rpc,
    queries,
  };
}

describe('workspace activity consent', () => {
  it.each([undefined, '', 'private', 'public', 'true'])(
    'denies missing or invalid consent: %s',
    async (value) => {
      const mock = client({ sharing: value ?? '' });
      await expect(
        getSharedActivity(mock.admin, 'workspace', 'subject', 'UTC')
      ).rejects.toBeInstanceOf(ProfileActivityUnavailable);
      expect(mock.rpc).not.toHaveBeenCalled();
    }
  );
  it('denies former members even when old consent remains', async () => {
    const mock = client({ member: false });
    await expect(
      getSharedActivity(mock.admin, 'workspace', 'subject', 'UTC')
    ).rejects.toBeInstanceOf(ProfileActivityUnavailable);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('fails closed when access cannot be verified', async () => {
    const mock = client({ error: new Error('offline') });
    await expect(
      getSharedActivity(mock.admin, 'workspace', 'subject', 'UTC')
    ).rejects.toThrow('offline');
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('shares only selected workspace totals, never personal aggregates or raw sessions', async () => {
    const mock = client();
    const stats = await getSharedActivity(
      mock.admin,
      'workspace',
      'subject',
      'Asia/Ho_Chi_Minh'
    );
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('get_time_tracker_stats', {
      p_user_id: 'subject',
      p_ws_id: 'workspace',
      p_is_personal: false,
      p_timezone: 'Asia/Ho_Chi_Minh',
      p_days_back: 90,
    });
    expect(Object.keys(stats)).toEqual([
      'today_time',
      'week_time',
      'month_time',
      'daily_activity',
    ]);
  });
  it('discards an in-flight result when sharing was revoked', async () => {
    const mock = client({ revoked: true });
    await expect(
      getSharedActivity(mock.admin, 'workspace', 'subject', 'UTC')
    ).rejects.toBeInstanceOf(ProfileActivityUnavailable);
  });
});
