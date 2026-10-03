import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  one: vi.fn(),
  eq: vi.fn(),
  retained: vi.fn(async () => null as unknown),
}));
vi.mock(
  '@/lib/calendar/google-color-operations/retained-generation-request-access',
  () => ({ getCalendarRetainedGeneration: mocks.retained })
);
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));

import { authorizeLegacySync } from './legacy-sync-access';

const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const request = new Request('https://calendar.example.com/sync');
const query = { eq: mocks.eq, maybeSingle: mocks.one };
const client = {
  from: () => ({ select: () => query }),
} as unknown as TypedSupabaseClient;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.eq.mockReturnValue(query);
  mocks.one.mockResolvedValue({
    data: {
      id: eventId,
      ws_id: 'trusted-workspace',
      google_event_id: 'remote',
    },
    error: null,
  });
  mocks.authorize.mockResolvedValue({
    wsId: 'trusted-workspace',
    userId: 'actor',
  });
});
it('derives workspace from an RLS-visible local event instead of accepting an override', async () => {
  const result = await authorizeLegacySync(request, client, {
    eventId,
    googleEventId: 'remote',
    wsId: 'foreign',
  });
  expect(result).toMatchObject({
    wsId: 'trusted-workspace',
    event: { id: eventId },
  });
  expect(mocks.authorize).toHaveBeenCalledWith(request, 'trusted-workspace');
});
it('rejects a mismatched remote identifier before privileged authorization', async () => {
  const result = await authorizeLegacySync(request, client, {
    eventId,
    googleEventId: 'other',
  });
  expect('error' in result && result.error.status).toBe(409);
  expect(mocks.authorize).not.toHaveBeenCalled();
});
it('rejects an ambiguous remote-only lookup before provider dispatch', async () => {
  mocks.one.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
  const result = await authorizeLegacySync(request, client, {
    googleEventId: 'remote',
  });
  expect('error' in result && result.error.status).toBe(404);
  expect(mocks.authorize).not.toHaveBeenCalled();
});
it('requires explicit authorized workspace when no local event exists', async () => {
  const missing = await authorizeLegacySync(request, client, {});
  expect('error' in missing && missing.error.status).toBe(400);
  await authorizeLegacySync(request, client, { wsId: 'personal' });
  expect(mocks.authorize).toHaveBeenCalledWith(request, 'personal');
});

it('routes retained events into recoverable writes while direct legacy writes stay blocked', async () => {
  mocks.retained.mockResolvedValue({
    generation: '1',
    phase: 'applied',
    pending: false,
  });
  const blocked = await authorizeLegacySync(request, client, { eventId });
  expect('error' in blocked && blocked.error.status).toBe(409);
  const recovered = await authorizeLegacySync(
    request,
    client,
    { eventId },
    { recoverable: true }
  );
  expect(recovered).toMatchObject({ event: { id: eventId } });
  expect(mocks.authorize).toHaveBeenCalledTimes(2);
  expect(mocks.retained).toHaveBeenCalledTimes(1);
});
