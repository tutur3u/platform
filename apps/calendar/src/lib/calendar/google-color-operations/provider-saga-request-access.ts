import { authorizeCalendarEventManagement } from '../../calendar-event-permission';
import { resolveCalendarSource } from '../source-resolver';
import { ColorOperationError } from './protocol';
import {
  type SagaBinding,
  SagaBindingSchema,
  type SagaEndpoint,
  sagaScope,
} from './provider-saga-protocol';

/** Provider clients never receive a caller source snapshot. Every SDK use reloads
 * management permission, both exact enabled connections and actor-owned tokens. */
export function createRequestProviderSagaAccess(
  request: Request,
  rawWsId: string,
  eventId: string
) {
  let actorId: string | undefined;
  async function authorization() {
    const authorized = await authorizeCalendarEventManagement(request, rawWsId);
    if ('error' in authorized || (actorId && actorId !== authorized.userId))
      throw new ColorOperationError(
        'unauthorized',
        'Provider saga access denied'
      );
    actorId = authorized.userId;
    return authorized;
  }
  async function resolve(
    authorized: Awaited<ReturnType<typeof authorization>>,
    endpoint: SagaEndpoint
  ) {
    const scope = sagaScope(endpoint);
    if (scope.wsId !== authorized.wsId || scope.eventId !== eventId)
      throw new ColorOperationError('identity', 'Provider saga scope changed');
    const source = await resolveCalendarSource({
      ...authorized,
      source:
        endpoint.provider === 'tuturuuu'
          ? {
              provider: 'tuturuuu',
              workspaceCalendarId: endpoint.workspaceCalendarId,
            }
          : {
              provider: endpoint.provider,
              connectionId: endpoint.identity.connectionId,
            },
    });
    if (
      source.provider !== endpoint.provider ||
      source.workspaceCalendarId !== endpoint.workspaceCalendarId
    )
      throw new ColorOperationError(
        'identity',
        'Provider saga calendar changed'
      );
    if (source.provider === 'tuturuuu' || endpoint.provider === 'tuturuuu')
      return { source };
    const { data: connection, error } = await authorized.sbAdmin
      .from('calendar_connections')
      .select('auth_token_id')
      .eq('id', endpoint.identity.connectionId)
      .eq('ws_id', authorized.wsId)
      .eq('provider', endpoint.provider)
      .eq('calendar_id', endpoint.identity.calendarId)
      .eq('is_enabled', true)
      .maybeSingle();
    if (
      error ||
      connection?.auth_token_id !== endpoint.identity.authTokenId ||
      source.externalCalendarId !== endpoint.identity.calendarId
    )
      throw new ColorOperationError(
        'identity',
        'Provider saga connection changed'
      );
    const { data: token, error: tokenError } = await authorized.sbAdmin
      .from('calendar_auth_tokens')
      .select('id,access_token,refresh_token')
      .eq('id', endpoint.identity.authTokenId)
      .eq('ws_id', authorized.wsId)
      .eq('user_id', authorized.userId)
      .eq('provider', endpoint.provider)
      .eq('is_active', true)
      .maybeSingle();
    if (tokenError || !token?.access_token)
      throw new ColorOperationError(
        'unauthorized',
        'Provider saga account unavailable'
      );
    return {
      source: {
        ...source,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
      },
      verifiedAuthTokenId: token.id,
    };
  }
  async function assertAllowed(rawBinding: SagaBinding) {
    const binding = SagaBindingSchema.parse(rawBinding);
    const authorized = await authorization();
    const { data: row, error } = await authorized.sbAdmin
      .from('workspace_calendar_events')
      .select(
        'provider,source_calendar_id,external_calendar_id,external_event_id,google_calendar_id,google_event_id,scheduling_metadata'
      )
      .eq('ws_id', authorized.wsId)
      .eq('id', eventId)
      .maybeSingle();
    if (error)
      throw new ColorOperationError(
        'storage',
        'Provider saga event unavailable'
      );
    const matches = (endpoint: SagaEndpoint) =>
      row &&
      row.provider === endpoint.provider &&
      row.source_calendar_id === endpoint.workspaceCalendarId &&
      (endpoint.provider === 'tuturuuu' ||
        ((row.external_calendar_id ?? row.google_calendar_id) ===
          endpoint.identity.calendarId &&
          (row.external_event_id ?? row.google_event_id) ===
            endpoint.identity.providerEventId));
    const initial = binding.source ? matches(binding.source) : !row;
    const placeholder =
      binding.action === 'create' &&
      matches(binding.destination) &&
      (row?.scheduling_metadata as Record<string, unknown> | null)
        ?.provider_saga_operation === binding.operationId;
    if (!initial && !placeholder) {
      // A moved event can already point at destination only after this exact
      // server-retained operation finalized. Request fields cannot assert that.
      const { data: operation, error: operationError } =
        await authorized.sbAdmin.rpc('calendar_provider_saga_operation', {
          p_action: 'read',
          p_ws_id: authorized.wsId,
          p_event_id: eventId,
          p_actor_id: authorized.userId,
          p_input: { id: binding.operationId },
        });
      const saved = operation as unknown as {
        phase?: string;
        prepared?: { binding?: unknown };
      } | null;
      const storedBinding = SagaBindingSchema.safeParse(
        saved?.prepared?.binding
      );
      if (
        operationError ||
        saved?.phase !== 'applied' ||
        !matches(binding.destination) ||
        !storedBinding.success ||
        JSON.stringify(storedBinding.data) !== JSON.stringify(binding)
      )
        throw new ColorOperationError(
          'identity',
          'Provider saga event source changed'
        );
    }
    if (binding.source) await resolve(authorized, binding.source);
    await resolve(authorized, binding.destination);
  }
  return {
    authorization,
    assertAllowed,
    async resolveEndpoint(binding: SagaBinding, endpoint: SagaEndpoint) {
      await assertAllowed(binding);
      if (
        JSON.stringify(endpoint) !== JSON.stringify(binding.source) &&
        JSON.stringify(endpoint) !== JSON.stringify(binding.destination)
      )
        throw new ColorOperationError(
          'identity',
          'Provider saga endpoint not admitted'
        );
      return resolve(await authorization(), endpoint);
    },
  };
}
