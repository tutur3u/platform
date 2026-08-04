import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  applyExternalChatMessageState: vi.fn(),
  digestExternalChatEnvelope: vi.fn(() => 'digest'),
  importExternalChatEvent: vi.fn(),
  readExternalChatSourceEvent: vi.fn(),
  recordExternalChatSourceEvent: vi.fn(),
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

describe('processExternalChatEnvelope replay handling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('promotes a matching probe ledger entry to authoritative history', async () => {
    store.readExternalChatSourceEvent.mockResolvedValue({
      delivery_mode: 'probe',
      payload_digest: 'digest',
      result: { messageId: 'native-message', threadId: 'thread-1' },
    });

    const result = await processExternalChatEnvelope(event, context);

    expect(result).toEqual({
      duplicate: true,
      messageId: 'native-message',
      threadId: 'thread-1',
    });
    expect(store.recordExternalChatSourceEvent).toHaveBeenCalledWith({
      connectorKey: 'opaque',
      event,
      result: { messageId: 'native-message', threadId: 'thread-1' },
      threadId: 'thread-1',
      wsId: context.wsId,
    });
    expect(store.importExternalChatEvent).not.toHaveBeenCalled();
    expect(store.applyExternalChatMessageState).not.toHaveBeenCalled();
    expect(store.upsertExternalChatObservation).not.toHaveBeenCalled();
  });

  it('drops malformed persisted thread ids during probe promotion', async () => {
    store.readExternalChatSourceEvent.mockResolvedValue({
      delivery_mode: 'probe',
      payload_digest: 'digest',
      result: { messageId: 'native-message', threadId: { invalid: true } },
    });

    await processExternalChatEnvelope(event, context);

    expect(store.recordExternalChatSourceEvent).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: null })
    );
    expect(store.importExternalChatEvent).not.toHaveBeenCalled();
  });

  it('classifies a changed-payload replay as a conflict', async () => {
    store.readExternalChatSourceEvent.mockResolvedValue({
      delivery_mode: 'historical',
      payload_digest: 'different-digest',
      result: {},
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
});
