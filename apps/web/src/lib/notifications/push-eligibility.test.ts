import { describe, expect, it, vi } from 'vitest';
import {
  getPushDigestSkipReason,
  getPushPreferenceSkipReason,
  PUSH_PREFERENCES_DISABLED_SKIP_REASON,
} from './push-eligibility';

const notification = {
  user_id: 'user-1',
  ws_id: 'ws-1',
  scope: 'workspace',
  type: 'task_assigned',
};

describe('send-time push preferences', () => {
  it('checks the account switch, then the event in its workspace', async () => {
    const rpc = vi.fn(
      async (_name: string, _args: Record<string, string | null>) => ({
        data: true,
        error: null,
      })
    );
    expect(await getPushPreferenceSkipReason({ rpc }, notification)).toBeNull();
    expect(rpc.mock.calls.map((call) => call[1])).toEqual([
      {
        p_user_id: 'user-1',
        p_event_type: 'push_notifications',
        p_channel: 'push',
        p_scope: 'user',
        p_ws_id: null,
      },
      {
        p_user_id: 'user-1',
        p_event_type: 'task_assigned',
        p_channel: 'push',
        p_scope: 'workspace',
        p_ws_id: 'ws-1',
      },
    ]);
  });

  it('skips when either setting is off and fails closed on lookup errors', async () => {
    const off = vi.fn(async () => ({ data: false, error: null }));
    expect(await getPushPreferenceSkipReason({ rpc: off }, notification)).toBe(
      PUSH_PREFERENCES_DISABLED_SKIP_REASON
    );
    const broken = vi.fn(async () => ({ data: null, error: { message: 'x' } }));
    await expect(
      getPushPreferenceSkipReason({ rpc: broken }, notification)
    ).rejects.toThrow('Failed to verify notification push preferences');
  });

  it('leaves Mail to its own eligibility RPC', async () => {
    const rpc = vi.fn();
    expect(
      await getPushPreferenceSkipReason(
        { rpc },
        { ...notification, type: 'mail_received' }
      )
    ).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('skips a digest without devices before any settings lookup', async () => {
    const rpc = vi.fn();
    expect(
      await getPushDigestSkipReason({ rpc }, 0, notification, 'no-devices')
    ).toBe('no-devices');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('skips a digest when push settings were turned off after enqueue', async () => {
    const rpc = vi.fn(
      async (_name: string, args: Record<string, string | null>) => ({
        data: args.p_event_type !== 'push_notifications',
        error: null,
      })
    );
    expect(
      await getPushDigestSkipReason({ rpc }, 2, notification, 'no-devices')
    ).toBe(PUSH_PREFERENCES_DISABLED_SKIP_REASON);
  });
});
