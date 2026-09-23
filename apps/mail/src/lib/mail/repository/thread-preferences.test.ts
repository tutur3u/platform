import { describe, expect, it, vi } from 'vitest';
import {
  mailThreadBulkPayloadSchema,
  updateMailStatePayloadSchema,
} from '../schemas';
import { threadIsVisible, updateThreadPreferences } from './thread-preferences';

describe('personal thread preferences', () => {
  it('suppresses snoozed threads until the persisted deadline, then restores Inbox visibility', () => {
    const now = Date.now();
    const state = { snoozed_until: new Date(now + 60000).toISOString() };
    expect(threadIsVisible(state, 'inbox', now)).toBe(false);
    expect(threadIsVisible(state, 'snoozed', now)).toBe(true);
    expect(threadIsVisible(state, 'inbox', now + 60001)).toBe(true);
    expect(threadIsVisible(state, 'snoozed', now + 60001)).toBe(false);
    expect(threadIsVisible(undefined, 'inbox', now)).toBe(true);
  });
  it('keeps muted threads discoverable outside Inbox and isolates absent user state', () => {
    expect(threadIsVisible({ muted_at: '2026-09-23' }, 'inbox')).toBe(false);
    expect(threadIsVisible({ muted_at: '2026-09-23' }, 'muted')).toBe(true);
    expect(threadIsVisible({ muted_at: '2026-09-23' }, 'archive')).toBe(true);
    expect(threadIsVisible(undefined, 'muted')).toBe(false);
  });
  it('rejects missing, stale and excessively distant snooze deadlines', () => {
    for (const snoozedUntil of [
      undefined,
      '2020-01-01T00:00:00.000Z',
      '2100-01-01T00:00:00.000Z',
    ]) {
      expect(
        updateMailStatePayloadSchema.safeParse({
          action: 'snooze',
          snoozedUntil,
        }).success
      ).toBe(false);
    }
    expect(
      mailThreadBulkPayloadSchema.safeParse({
        action: 'snooze',
        threadIds: ['00000000-0000-4000-8000-000000000001'],
        snoozedUntil: new Date(Date.now() + 3600000).toISOString(),
      }).success
    ).toBe(true);
  });
  it('uses an atomic RPC with the verified actor and deduplicated authorized thread ids', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await updateThreadPreferences({
      admin: { schema: () => ({ rpc }) },
      mailboxId: 'box',
      userId: 'member',
      threadIds: ['thread', 'thread'],
      payload: { action: 'mute' },
    });
    expect(rpc).toHaveBeenCalledWith('set_mail_thread_preference', {
      p_mailbox_id: 'box',
      p_user_id: 'member',
      p_thread_ids: ['thread'],
      p_action: 'mute',
      p_snoozed_until: null,
    });
  });
});
