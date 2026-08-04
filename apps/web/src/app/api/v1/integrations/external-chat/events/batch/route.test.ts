import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticate = vi.fn();
const processEvent = vi.fn();
const upsert = vi.fn();

vi.mock('@/lib/external-chat/ingest-auth', () => ({
  authenticateExternalChatIngest: authenticate,
}));
vi.mock('@/lib/external-chat/ingest', () => ({
  processExternalChatEnvelope: processEvent,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({ from: () => ({ upsert }) }),
  }),
}));

const event = {
  agentId: '1',
  content: 'Historical message',
  contentType: 1,
  context: {},
  deliveryMode: 'historical',
  direction: 'visitor',
  eventId: 'message:10',
  kind: 'message',
  messageId: '10',
  status: 'sent',
  timestamp: '2026-08-01T00:00:00.000Z',
  version: 2,
  visitorId: '20',
  visitorProfile: {},
};

describe('external chat historical batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticate.mockResolvedValue({
      state: {
        binding: { canonical_project_id: 'opaque', settings: {} },
        credentials: { configuration_revision: 1 },
      },
      wsId: '00000000-0000-4000-8000-000000000001',
    });
    processEvent.mockResolvedValue({ duplicate: false });
    upsert.mockResolvedValue({ error: null });
  });

  it('imports bounded historical events without a live publishing path', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/events/batch', {
        body: JSON.stringify({
          events: [event],
          cursor: { id: '10' },
          highWaterMark: { id: '20' },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );
    expect(response.status).toBe(200);
    expect(processEvent).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        connector_key: 'opaque',
        cursor: { id: '10' },
        high_water_mark: { id: '20' },
        stream_key: 'historical-events',
        ws_id: '00000000-0000-4000-8000-000000000001',
      }),
      { onConflict: 'ws_id,connector_key,stream_key' }
    );
    expect(await response.json()).toEqual({
      accepted: 1,
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      duplicates: 0,
      failed: 0,
      failures: [],
    });
  });

  it('rejects unauthenticated batches', async () => {
    authenticate.mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/events/batch', {
        body: JSON.stringify({ events: [event] }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );
    expect(response.status).toBe(401);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it('rejects live events on the silent batch endpoint', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/events/batch', {
        body: JSON.stringify({ events: [{ ...event, deliveryMode: 'live' }] }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );
    expect(response.status).toBe(400);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it('rejects probe events on the silent batch endpoint', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/events/batch', {
        body: JSON.stringify({ events: [{ ...event, deliveryMode: 'probe' }] }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );
    expect(response.status).toBe(400);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it('preserves stored cursor fields when a batch omits them', async () => {
    processEvent.mockResolvedValueOnce({ duplicate: true });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/events/batch', {
        body: JSON.stringify({ events: [event] }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );
    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ cursor: expect.anything() }),
      { onConflict: 'ws_id,connector_key,stream_key' }
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({ accepted: 1, duplicates: 1, failed: 0 })
    );
  });

  it('isolates conflicts and does not advance the batch cursor', async () => {
    processEvent.mockResolvedValueOnce({
      conflict: 'payload_mismatch',
      duplicate: true,
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/events/batch', {
        body: JSON.stringify({
          events: [event],
          cursor: { id: '10' },
          highWaterMark: { id: '20' },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );
    expect(response.status).toBe(207);
    expect(upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({
        cursor: expect.anything(),
        high_water_mark: expect.anything(),
      }),
      { onConflict: 'ws_id,connector_key,stream_key' }
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        accepted: 0,
        duplicates: 0,
        failed: 1,
        failures: [
          {
            code: 'external_chat_event_payload_mismatch',
            eventId: event.eventId,
          },
        ],
      })
    );
  });
});
