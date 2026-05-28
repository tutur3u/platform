import { describe, expect, it, vi } from 'vitest';
import { listCalendarConnections } from './calendar';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('calendar internal API helpers', () => {
  it('lists calendar connections through the centralized calendar API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        connections: [{ id: 'connection-1', calendar_id: 'primary' }],
      })
    );

    const connections = await listCalendarConnections('workspace 1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/calendar/connections?wsId=workspace+1',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(connections).toEqual([
      { id: 'connection-1', calendar_id: 'primary' },
    ]);
  });
});
