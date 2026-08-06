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

  it('imports independent visitor lanes concurrently within a bounded limit', async () => {
    let active = 0;
    let maxActive = 0;
    processEvent.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { duplicate: false };
    });
    const events = Array.from({ length: 20 }, (_, index) => ({
      ...event,
      eventId: `message:${index}`,
      messageId: String(index),
      visitorId: String(index),
    }));
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/events/batch', {
        body: JSON.stringify({ events }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(processEvent).toHaveBeenCalledTimes(20);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(8);
  });

  it('preserves source order within each visitor lane', async () => {
    const completed: string[] = [];
    processEvent.mockImplementation(async (input) => {
      if (input.kind === 'message')
        await new Promise((resolve) => setTimeout(resolve, 10));
      completed.push(input.eventId);
      return { duplicate: false };
    });
    const stateEvent = {
      ...event,
      content: undefined,
      contentType: undefined,
      eventId: 'state:10:seen',
      kind: 'message_state',
      status: 'seen',
    };
    const otherVisitorEvent = {
      ...event,
      eventId: 'message:11',
      messageId: '11',
      visitorId: '21',
    };
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/events/batch', {
        body: JSON.stringify({
          events: [event, stateEvent, otherVisitorEvent],
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(completed.indexOf(event.eventId)).toBeLessThan(
      completed.indexOf(stateEvent.eventId)
    );
  });

  it('does not merge visitor lanes when opaque identifiers contain colons', async () => {
    let active = 0;
    let maxActive = 0;
    processEvent.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { duplicate: false };
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/events/batch', {
        body: JSON.stringify({
          events: [
            { ...event, agentId: 'a:b', visitorId: 'c' },
            {
              ...event,
              agentId: 'a',
              eventId: 'message:11',
              messageId: '11',
              visitorId: 'b:c',
            },
          ],
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(maxActive).toBe(2);
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
      expect.not.objectContaining({ cursor: expect.anything() }),
      { onConflict: 'ws_id,connector_key,stream_key' }
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ high_water_mark: expect.anything() }),
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

  it('defers missing-message state events without advancing the cursor', async () => {
    processEvent.mockResolvedValueOnce({ deferred: true, found: false });
    const deferredEvent = {
      ...event,
      content: undefined,
      contentType: undefined,
      eventId: 'state:missing-message:seen',
      kind: 'message_state',
      status: 'seen',
    };
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/events/batch', {
        body: JSON.stringify({
          events: [deferredEvent],
          cursor: { id: '10' },
          highWaterMark: { id: '20' },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(207);
    expect(upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ cursor: expect.anything() }),
      { onConflict: 'ws_id,connector_key,stream_key' }
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ high_water_mark: expect.anything() }),
      { onConflict: 'ws_id,connector_key,stream_key' }
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        accepted: 0,
        failed: 1,
        failures: [
          {
            code: 'external_chat_event_deferred',
            eventId: deferredEvent.eventId,
          },
        ],
      })
    );
  });
});
