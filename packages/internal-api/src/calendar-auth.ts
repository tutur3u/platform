import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface CalendarAuthUrlResponse {
  authUrl: string;
}

export async function getGoogleCalendarAuthUrl(
  wsId: string,
  options?: InternalApiClientOptions,
  // Reconnecting a rejected account: Google must show consent to issue a
  // fresh refresh token.
  reconnect = false,
  accountId?: string
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarAuthUrlResponse>('/api/v1/calendar/auth', {
    query: { wsId, accountId, ...(reconnect ? { reconnect: '1' } : {}) },
    cache: 'no-store',
  });
}

export async function getMicrosoftCalendarAuthUrl(
  wsId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CalendarAuthUrlResponse>(
    '/api/v1/calendar/auth/microsoft',
    {
      query: { wsId },
      cache: 'no-store',
    }
  );
}
