import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claimRetriableWebhookEvent,
  SEPAY_STALE_RECEIVED_EVENT_TTL_MS,
} from './event';
import type { NormalizedSepayPayload } from './schemas';

function createNormalizedPayload(): NormalizedSepayPayload {
  return {
    accountNumber: '123456789',
    bankAccountId: '987',
    code: 'TX123',
    content: 'Invoice paid',
    description: 'Customer payment',
    eventId: 'sepay_evt_1',
    gateway: 'VCB',
    raw: {
      amount: 150000,
      id: 'sepay_evt_1',
    },
    referenceCode: 'INV-123',
    subAccountId: null,
    transactionDate: '2026-06-03T01:00:00.000Z',
    transferAmount: 150000,
    transferType: 'in',
  };
}

function createClaimMock(result: { data: { id: string } | null; error: null }) {
  const query = {
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    lte: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query),
    update: vi.fn(() => query),
  };
  const sbAdmin = {
    from: vi.fn(() => query),
  };

  return { query, sbAdmin };
}

describe('SePay webhook event helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('claims failed events only while they are still failed and transactionless', async () => {
    const { query, sbAdmin } = createClaimMock({
      data: { id: 'event_1' },
      error: null,
    });

    const eventId = await claimRetriableWebhookEvent({
      endpointId: 'endpoint_1',
      existingEventId: 'event_1',
      existingStatus: 'failed',
      payload: createNormalizedPayload(),
      sbAdmin: sbAdmin as never,
      walletId: 'wallet_1',
      wsId: 'ws_1',
    });

    expect(eventId).toBe('event_1');
    expect(sbAdmin.from).toHaveBeenCalledWith('sepay_webhook_events');
    expect(query.is).toHaveBeenCalledWith('created_transaction_id', null);
    expect(query.eq).toHaveBeenCalledWith('id', 'event_1');
    expect(query.eq).toHaveBeenCalledWith('ws_id', 'ws_1');
    expect(query.eq).toHaveBeenCalledWith('status', 'failed');
    expect(query.lte).not.toHaveBeenCalled();
  });

  it('returns null when another webhook worker already claimed the failed event', async () => {
    const { sbAdmin } = createClaimMock({
      data: null,
      error: null,
    });

    await expect(
      claimRetriableWebhookEvent({
        endpointId: 'endpoint_1',
        existingEventId: 'event_1',
        existingStatus: 'failed',
        payload: createNormalizedPayload(),
        sbAdmin: sbAdmin as never,
        walletId: 'wallet_1',
        wsId: 'ws_1',
      })
    ).resolves.toBeNull();
  });

  it('claims received events only when the row is still stale and transactionless', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T02:00:00.000Z'));
    const { query, sbAdmin } = createClaimMock({
      data: { id: 'event_1' },
      error: null,
    });

    await claimRetriableWebhookEvent({
      endpointId: 'endpoint_1',
      existingEventId: 'event_1',
      existingStatus: 'received',
      payload: createNormalizedPayload(),
      sbAdmin: sbAdmin as never,
      walletId: 'wallet_1',
      wsId: 'ws_1',
    });

    expect(query.is).toHaveBeenCalledWith('created_transaction_id', null);
    expect(query.eq).toHaveBeenCalledWith('status', 'received');
    expect(query.lte).toHaveBeenCalledWith(
      'received_at',
      new Date(Date.now() - SEPAY_STALE_RECEIVED_EVENT_TTL_MS).toISOString()
    );
  });
});
