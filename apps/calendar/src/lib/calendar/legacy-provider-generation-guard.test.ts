import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { assertLegacyCalendarWriteAllowed } from './legacy-provider-generation-guard';

const args = {
  wsId: 'workspace',
  userId: 'actor',
  eventIds: ['first', 'second'],
  blockCandidate: false,
};
describe('legacy provider generation preflight', () => {
  it('blocks candidate bulk before even reading a generation', async () => {
    const rpc = vi.fn();
    await expect(
      assertLegacyCalendarWriteAllowed({
        ...args,
        blockCandidate: true,
        sbAdmin: { rpc } as unknown as TypedSupabaseClient,
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('preserves ledgerless legacy rows and binds reads to authenticated actor/workspace', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await assertLegacyCalendarWriteAllowed({
      ...args,
      sbAdmin: { rpc } as unknown as TypedSupabaseClient,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith('calendar_retained_generation', {
      p_ws_id: 'workspace',
      p_actor_id: 'actor',
      p_event_id: 'second',
    });
  });
  it('preflights the entire batch and blocks a retained row after an ordinary first row', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { generation: '2' }, error: null });
    await expect(
      assertLegacyCalendarWriteAllowed({
        ...args,
        sbAdmin: { rpc } as unknown as TypedSupabaseClient,
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('fails closed without leaking database diagnostics', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'private details' } });
    await expect(
      assertLegacyCalendarWriteAllowed({
        ...args,
        sbAdmin: { rpc } as unknown as TypedSupabaseClient,
      })
    ).rejects.toMatchObject({
      status: 503,
      message: 'Calendar generation unavailable',
    });
  });
});

it('checks all 250 rows with at most eight reads in flight before allowing the batch', async () => {
  let active = 0;
  let peak = 0;
  const rpc = vi.fn(async () => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    return { data: null, error: null };
  });
  await assertLegacyCalendarWriteAllowed({
    ...args,
    eventIds: Array.from({ length: 250 }, (_, index) => `event${index}`),
    sbAdmin: { rpc } as unknown as TypedSupabaseClient,
  });
  expect(rpc).toHaveBeenCalledTimes(250);
  expect(peak).toBe(8);
  expect(active).toBe(0);
});

it('blocks a retained final row in a full sync batch', async () => {
  const rpc = vi.fn(async (_name, input) => ({
    data: input.p_event_id === 'event249' ? { generation: '1' } : null,
    error: null,
  }));
  await expect(
    assertLegacyCalendarWriteAllowed({
      ...args,
      eventIds: Array.from({ length: 250 }, (_, index) => `event${index}`),
      sbAdmin: { rpc } as unknown as TypedSupabaseClient,
    })
  ).rejects.toMatchObject({ status: 409 });
  expect(rpc).toHaveBeenCalledTimes(250);
});
