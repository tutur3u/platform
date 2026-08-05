import { describe, expect, it } from 'vitest';
import type { ExternalChatEventEnvelope } from './schemas';
import {
  digestExternalChatBatch,
  digestExternalChatEnvelope,
} from './source-events';

const textEvent: ExternalChatEventEnvelope = {
  agentId: 'bucket-1',
  attachment: {},
  content: 'Historical message',
  contentType: 1,
  context: {},
  deliveryMode: 'historical',
  direction: 'visitor',
  eventId: 'message:1:revision',
  kind: 'message',
  messageId: '1',
  status: 'sent',
  timestamp: '2026-08-05T07:00:00.000Z',
  version: 2,
  visitorId: 'visitor-1',
  visitorProfile: {},
};

describe('external chat source digests', () => {
  it('treats a schema-defaulted empty attachment as omitted in batch receipts', () => {
    const { attachment: _attachment, ...withoutAttachment } = textEvent;

    expect(digestExternalChatEnvelope(textEvent)).not.toBe(
      digestExternalChatEnvelope(withoutAttachment)
    );
    expect(digestExternalChatBatch([textEvent])).toBe(
      digestExternalChatBatch([withoutAttachment])
    );
  });

  it('retains non-empty attachment metadata in the digest', () => {
    expect(
      digestExternalChatBatch([
        {
          ...textEvent,
          attachment: { legacyUrl: 'https://example.test/image.png' },
          contentType: 2,
        },
      ])
    ).not.toBe(digestExternalChatBatch([textEvent]));
  });
});
