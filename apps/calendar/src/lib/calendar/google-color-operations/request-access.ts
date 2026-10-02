import { google, OAuth2Client } from '@tuturuuu/google';
import { authorizeCalendarEventManagement } from '../../calendar-event-permission';
import { resolveCalendarSourceForEvent } from '../source-resolver';
import {
  ColorOperationError,
  type ColorOperationIdentity,
  sameColorOperationIdentity,
} from './protocol';

/** Reconciliation accepts an operation ID, never an account/source override.
 * This request-bound resolver discovers exact identity from current server rows.
 * It rechecks permission, event linkage and token ownership on every SDK use. */
export function createRequestColorOperationAccess(
  request: Request,
  rawWsId: string,
  eventId: string,
  dependencies = {
    authorize: authorizeCalendarEventManagement,
    resolveSource: resolveCalendarSourceForEvent,
  }
) {
  let actorId: string | undefined;
  async function resolve(expected?: ColorOperationIdentity) {
    const access = await dependencies.authorize(request, rawWsId);
    if ('error' in access || (actorId && access.userId !== actorId))
      throw new ColorOperationError(
        'unauthorized',
        'Google operation access denied'
      );
    actorId = access.userId;
    const { data: event, error } = await access.sbAdmin
      .from('workspace_calendar_events')
      .select(
        'provider,source_calendar_id,external_calendar_id,google_calendar_id,external_event_id,google_event_id'
      )
      .eq('ws_id', access.wsId)
      .eq('id', eventId)
      .maybeSingle();
    if (error || !event || event.provider !== 'google')
      throw new ColorOperationError(
        'identity',
        'Google operation event unavailable'
      );
    const source = await dependencies.resolveSource({ ...access, event });
    if (source.provider !== 'google' || !source.accessToken)
      throw new ColorOperationError(
        'identity',
        'Google operation source unavailable'
      );
    const { data: connection, error: connectionError } = await access.sbAdmin
      .from('calendar_connections')
      .select('auth_token_id')
      .eq('id', source.connectionId)
      .eq('ws_id', access.wsId)
      .eq('provider', 'google')
      .eq('calendar_id', source.externalCalendarId)
      .eq('is_enabled', true)
      .maybeSingle();
    if (connectionError || !connection?.auth_token_id)
      throw new ColorOperationError(
        'identity',
        'Google operation connection unavailable'
      );
    const { data: token, error: tokenError } = await access.sbAdmin
      .from('calendar_auth_tokens')
      .select('id,access_token,refresh_token')
      .eq('id', connection.auth_token_id)
      .eq('ws_id', access.wsId)
      .eq('user_id', access.userId)
      .eq('provider', 'google')
      .eq('is_active', true)
      .maybeSingle();
    const providerEventId = event.external_event_id ?? event.google_event_id;
    if (tokenError || !token?.access_token || !providerEventId)
      throw new ColorOperationError(
        'unauthorized',
        'Google operation account unavailable'
      );
    const identity: ColorOperationIdentity = {
      wsId: access.wsId,
      eventId,
      connectionId: source.connectionId,
      authTokenId: token.id,
      calendarId: source.externalCalendarId,
      providerEventId,
    };
    if (expected && !sameColorOperationIdentity(identity, expected))
      throw new ColorOperationError(
        'identity',
        'Google operation source changed'
      );
    return {
      ...access,
      identity,
      source: {
        ...source,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
      },
      verifiedAuthTokenId: token.id,
    };
  }
  return {
    discover: () => resolve(),
    async assertAllowed(identity: ColorOperationIdentity) {
      await resolve(identity);
    },
    async provider(identity: ColorOperationIdentity) {
      const resolved = await resolve(identity);
      const auth = new OAuth2Client({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
      });
      auth.setCredentials({
        access_token: resolved.source.accessToken,
        refresh_token: resolved.source.refreshToken ?? undefined,
      });
      return {
        source: resolved.source,
        verifiedAuthTokenId: resolved.verifiedAuthTokenId,
        calendar: google.calendar({
          version: 'v3',
          auth,
        }),
      };
    },
  };
}
