import { google, OAuth2Client } from '@tuturuuu/google';
import { z } from 'zod';
import { authorizeCalendarEventManagement } from '../../calendar-event-permission';
import {
  resolveCalendarSource,
  resolveCalendarSourceForEvent,
} from '../source-resolver';
import {
  ColorOperationError,
  type ColorOperationIdentity,
  sameColorOperationIdentity,
} from './protocol';

const Tombstone = z.object({
  id: z.guid(),
  phase: z.enum(['applied', 'superseded']),
  identity: z
    .object({
      wsId: z.guid(),
      eventId: z.guid(),
      connectionId: z.guid(),
      authTokenId: z.guid(),
      calendarId: z.string().min(1),
      providerEventId: z.string().min(1),
    })
    .strict(),
});

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
    resolveConnection: resolveCalendarSource,
  },
  options: { operationId?: () => string | undefined } = {}
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
    if (error)
      throw new ColorOperationError(
        'storage',
        'Google operation event unavailable'
      );
    let tombstoneIdentity: ColorOperationIdentity | undefined;
    if (!event && options.operationId?.()) {
      const operationId = options.operationId();
      const result = await access.sbAdmin.rpc(
        'calendar_google_mutation_operation',
        {
          p_action: 'read',
          p_ws_id: access.wsId,
          p_event_id: eventId,
          p_actor_id: access.userId,
          p_input: { id: operationId },
        }
      );
      const parsed = Tombstone.safeParse(result.data);
      // The RPC only allows a missing event for a terminal confirmed deletion.
      // Its token boundary is rechecked after workspace authorization and before resolving a client.
      if (
        result.error ||
        !parsed.success ||
        parsed.data.id !== operationId ||
        parsed.data.identity.wsId !== access.wsId ||
        parsed.data.identity.eventId !== eventId
      )
        throw new ColorOperationError(
          'identity',
          'Google deletion recovery unavailable'
        );
      tombstoneIdentity = parsed.data.identity;
    }
    if (
      (!event && !tombstoneIdentity) ||
      (event && event.provider !== 'google')
    )
      throw new ColorOperationError(
        'identity',
        'Google operation event unavailable'
      );
    const source = tombstoneIdentity
      ? await dependencies.resolveConnection({
          ...access,
          source: {
            provider: 'google',
            connectionId: tombstoneIdentity.connectionId,
          },
        })
      : await dependencies.resolveSource({ ...access, event: event! });
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
    const providerEventId =
      event?.external_event_id ??
      event?.google_event_id ??
      tombstoneIdentity?.providerEventId;
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
    if (
      (expected && !sameColorOperationIdentity(identity, expected)) ||
      (tombstoneIdentity &&
        !sameColorOperationIdentity(identity, tombstoneIdentity))
    )
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
