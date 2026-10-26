import type { CalendarConnectionsManagerState } from './use-calendar-connections-manager';

type ReconnectState = Pick<
  CalendarConnectionsManagerState,
  'googleAuthMutation' | 'microsoftAuthMutation'
>;

/**
 * Starts the provider's reconnect flow for a rejected or held account. Google
 * must show consent so it issues a fresh refresh token instead of the stored,
 * rejected one; Microsoft's flow always asks for consent.
 */
export function reconnectCalendarProvider(
  state: ReconnectState,
  provider: string
) {
  if (provider === 'google')
    state.googleAuthMutation.mutate({ reconnect: true });
  else state.microsoftAuthMutation.mutate();
}
