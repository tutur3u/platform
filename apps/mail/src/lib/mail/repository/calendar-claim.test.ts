import { beforeEach, expect, it, vi } from 'vitest';
import type { MailRouteContext } from '../types';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  message: vi.fn(),
  table: vi.fn(),
}));
vi.mock('./bootstrap', () => ({ requireMailboxAccess: mocks.access }));
vi.mock('./messages', () => ({ getMailMessage: mocks.message }));
vi.mock('./shared', () => ({ mailMessageTable: mocks.table }));

import { claimCalendarReply } from './calendar-claim';

const ctx = { normalizedWsId: 'ws', user: { id: 'actor' } } as MailRouteContext;
let metadata: Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  metadata = { retained: 'metadata' };
  mocks.access.mockResolvedValue({
    mailbox: { address: 'guest@example.test' },
  });
  mocks.message.mockResolvedValue({ status: 'sent' });
  mocks.table.mockImplementation(() => {
    let patch: Record<string, unknown> | undefined;
    const conditions: Record<string, unknown> = {};
    const b = {
      select: () => b,
      update: (value: Record<string, unknown>) => {
        patch = value;
        return b;
      },
      eq: (key: string, value: unknown) => {
        conditions[key] = value;
        return b;
      },
      is: (key: string, value: unknown) => {
        conditions[key] = value;
        return b;
      },
      maybeSingle: async () => {
        if (!patch)
          return { data: { metadata: structuredClone(metadata) }, error: null };
        expect(conditions.id).toBe('source');
        expect(conditions.mailbox_id).toBe('box');
        if (conditions.metadata !== JSON.stringify(metadata))
          return { data: null, error: null };
        metadata = patch.metadata as Record<string, unknown>;
        return { data: { id: 'source' }, error: null };
      },
    };
    return b;
  });
});
it('only one concurrent tab/device acquires the invitation reply claim', async () => {
  const results = await Promise.all([
    claimCalendarReply(
      ctx,
      'box',
      'source',
      'first',
      'ACCEPTED',
      'request-first'
    ),
    claimCalendarReply(
      ctx,
      'box',
      'source',
      'second',
      'ACCEPTED',
      'request-second'
    ),
  ]);
  expect(results.map((result) => result.status)).toEqual([
    'claimed',
    'sending',
  ]);
  expect(metadata.retained).toBe('metadata');
});
it('resumes the same interrupted preparation but blocks a second intent before a draft exists', async () => {
  await claimCalendarReply(
    ctx,
    'box',
    'source',
    'first',
    'TENTATIVE',
    'request-first'
  );
  mocks.message.mockResolvedValue(null);
  expect(
    await claimCalendarReply(
      ctx,
      'box',
      'source',
      'first',
      'TENTATIVE',
      'request-first'
    )
  ).toEqual({ status: 'claimed' });
  expect(
    await claimCalendarReply(
      ctx,
      'box',
      'source',
      'second',
      'DECLINED',
      'request-second'
    )
  ).toEqual({ status: 'sending' });
});
it.each(['sent', 'failed'])(
  'does not duplicate a previous %s response even with a different request ID',
  async (status) => {
    await claimCalendarReply(
      ctx,
      'box',
      'source',
      'first',
      'ACCEPTED',
      'request-first'
    );
    mocks.message.mockResolvedValue({ status });
    expect(
      await claimCalendarReply(
        ctx,
        'box',
        'source',
        'second',
        'ACCEPTED',
        'request-second'
      )
    ).toEqual({ status });
  }
);
it('allows a deliberate response change after the previous provider outcome settles', async () => {
  await claimCalendarReply(
    ctx,
    'box',
    'source',
    'first',
    'ACCEPTED',
    'request-first'
  );
  expect(
    await claimCalendarReply(
      ctx,
      'box',
      'source',
      'second',
      'DECLINED',
      'request-second'
    )
  ).toEqual({ status: 'claimed' });
});
it('denies revoked and grouped identities before reading or writing claims', async () => {
  for (const access of [null, { mailbox: { groupPolicy: {} } }]) {
    mocks.access.mockResolvedValue(access);
    expect(
      await claimCalendarReply(
        ctx,
        'box',
        'source',
        'first',
        'ACCEPTED',
        'request-first'
      )
    ).toEqual({ status: 'unavailable' });
  }
  expect(mocks.table).not.toHaveBeenCalled();
});
