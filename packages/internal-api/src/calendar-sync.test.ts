import { expect, it, vi } from 'vitest';
import { syncWorkspaceCalendar } from './calendar-sync';

it('preserves inbound defaults and supports explicit bidirectional synchronization', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
  });
  const options = {
    baseUrl: 'https://calendar.example.com',
    fetch: fetchMock as typeof fetch,
  };
  await syncWorkspaceCalendar('workspace', options);
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      body: JSON.stringify({ direction: 'inbound', source: 'manual' }),
    })
  );
  await syncWorkspaceCalendar('workspace', options, { direction: 'both' });
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      body: JSON.stringify({ direction: 'both', source: 'manual' }),
    })
  );
});
