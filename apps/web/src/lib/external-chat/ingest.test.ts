import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  applyExternalChatMessageState: vi.fn(),
  claimExternalChatSourceEvent: vi.fn(),
  importExternalChatEvent: vi.fn(),
  recordExternalChatSourceEvent: vi.fn(),
  releaseExternalChatSourceEvent: vi.fn(),
  upsertExternalChatObservation: vi.fn(),
}));

vi.mock('./store', () => store);

import { processExternalChatEnvelope } from './ingest';
import type { ExternalChatEventEnvelope } from './schemas';

const event: ExternalChatEventEnvelope = {
  agentId: 'bucket-1',
  content: 'Authoritative history',
  contentType: 1,
  context: {},
  deliveryMode: 'historical',
  direction: 'visitor',
  eventId: 'message:1',
  kind: 'message',
  messageId: '1',
  status: 'sent',
  timestamp: '2026-08-01T00:00:00.000Z',
  version: 2,
  visitorId: 'visitor-1',
  visitorProfile: {},
};

const context = {
  configurationRevision: 1,
  connectorKey: 'opaque',
  settings: {},
  wsId: '00000000-0000-4000-8000-000000000001',
};

const stateEvent: ExternalChatEventEnvelope = {
  agentId: 'bucket-1',
  deliveryMode: 'live',
  eventId: 'state:1:seen',
  kind: 'message_state',
  messageId: '1',
  metadata: {},
  status: 'seen',
  timestamp: '2026-08-01T00:01:00.000Z',
  version: 2,
  visitorId: 'visitor-1',
};

describe('processExternalChatEnvelope replay handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.claimExternalChatSourceEvent.mockResolvedValue({ status: 'claimed' });
    store.recordExternalChatSourceEvent.mockResolvedValue(undefined);
    store.releaseExternalChatSourceEvent.mockResolvedValue(undefined);
  });

  it('promotes a matching probe ledger entry to authoritative history', async () => {
    store.claimExternalChatSourceEvent.mockResolvedValue({
      result: { messageId: 'native-message', threadId: 'thread-1' },
      status: 'duplicate',
    });

    const result = await processExternalChatEnvelope(event, context);

    expect(result).toEqual({
      duplicate: true,
      messageId: 'native-message',
      threadId: 'thread-1',
    });
    expect(store.recordExternalChatSourceEvent).not.toHaveBeenCalled();
    expect(store.importExternalChatEvent).not.toHaveBeenCalled();
    expect(store.applyExternalChatMessageState).not.toHaveBeenCalled();
    expect(store.upsertExternalChatObservation).not.toHaveBeenCalled();
  });

  it('defers while another request owns the source event claim', async () => {
    store.claimExternalChatSourceEvent.mockResolvedValue({
      status: 'in_progress',
    });

    await expect(processExternalChatEnvelope(event, context)).resolves.toEqual({
      deferred: true,
    });

    expect(store.recordExternalChatSourceEvent).not.toHaveBeenCalled();
    expect(store.importExternalChatEvent).not.toHaveBeenCalled();
    expect(store.applyExternalChatMessageState).not.toHaveBeenCalled();
    expect(store.upsertExternalChatObservation).not.toHaveBeenCalled();
  });

  it('classifies a changed-payload replay as a conflict', async () => {
    store.claimExternalChatSourceEvent.mockResolvedValue({
      status: 'payload_mismatch',
    });

    await expect(processExternalChatEnvelope(event, context)).resolves.toEqual({
      conflict: 'payload_mismatch',
      duplicate: true,
    });
    expect(store.recordExternalChatSourceEvent).not.toHaveBeenCalled();
    expect(store.importExternalChatEvent).not.toHaveBeenCalled();
    expect(store.applyExternalChatMessageState).not.toHaveBeenCalled();
    expect(store.upsertExternalChatObservation).not.toHaveBeenCalled();
  });

  it('defers state events until their message exists without consuming them', async () => {
    store.applyExternalChatMessageState.mockResolvedValue({ found: false });

    await expect(
      processExternalChatEnvelope(stateEvent, context)
    ).resolves.toEqual({ deferred: true, found: false });
    expect(store.recordExternalChatSourceEvent).not.toHaveBeenCalled();
    expect(store.releaseExternalChatSourceEvent).toHaveBeenCalledWith({
      connectorKey: 'opaque',
      event: stateEvent,
      wsId: context.wsId,
    });
  });

  it('keeps probe messages out of the native chat projection', async () => {
    const probeEvent = { ...event, deliveryMode: 'probe' as const };

    await expect(
      processExternalChatEnvelope(probeEvent, context)
    ).resolves.toEqual({ accepted: true });

    expect(store.importExternalChatEvent).not.toHaveBeenCalled();
    expect(store.recordExternalChatSourceEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: probeEvent, result: { accepted: true } })
    );
  });
});
