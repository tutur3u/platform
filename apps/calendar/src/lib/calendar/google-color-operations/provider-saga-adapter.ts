import type { calendar_v3 } from '@tuturuuu/google';
import { ColorOperationError } from './protocol';
import {
  type ProviderSagaAccess,
  type ProviderSagaAdapter,
  SAGA_OPERATION_MARKER,
  type SagaBinding,
  SagaBindingSchema,
  type SagaCheckpoint,
  type SagaEndpoint,
  SagaEndpointSchema,
  type SagaObservation,
  type SagaPayload,
  SagaPayloadSchema,
} from './provider-saga-protocol';

type GoogleEndpoint = Extract<SagaEndpoint, { provider: 'google' }>;
type Present = Extract<SagaObservation, { absent: false }>;
export type ProviderSagaCapabilities = {
  googleInsert?: boolean;
  googleConditionalDelete?: boolean;
  // Capabilities are supplied only by server assembly after endpoint acceptance.
  // Graph conditional mutation and ambiguous recovery remain unverified.
  googleMove?: boolean;
  microsoft?: false;
};
function failure(reason: ConstructorParameters<typeof ColorOperationError>[0]) {
  return new ColorOperationError(reason, 'Provider saga operation unavailable');
}
function status(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown };
  };
  return Number(candidate.response?.status ?? candidate.code);
}
function admittedEndpoint(binding: SagaBinding, endpoint: SagaEndpoint) {
  const parsed = SagaEndpointSchema.parse(endpoint);
  const encoded = JSON.stringify(parsed);
  if (
    encoded !== JSON.stringify(binding.source) &&
    encoded !== JSON.stringify(binding.destination)
  )
    throw failure('identity');
  if (parsed.provider !== 'google') throw failure('unavailable');
  return parsed;
}
function observation(
  data: calendar_v3.Schema$Event,
  eventId: string
): SagaObservation {
  if (data.id !== eventId) throw failure('identity');
  if (data.status === 'cancelled') return { absent: true };
  if (!data.etag) throw failure('unavailable');
  return {
    absent: false,
    eventId,
    etag: data.etag,
    marker: data.extendedProperties?.private?.[SAGA_OPERATION_MARKER] ?? null,
    event: data as Record<string, unknown>,
  };
}
/** Only this new saga adapter uses these capability gates. Existing disabled
 * color/patch/delete adapters retain their independent admission policy.
 * The caller supplies request-bound resolution, never a credential snapshot. */
export function createProviderSagaAdapter(args: {
  access: ProviderSagaAccess;
  resolveGoogle: (
    binding: SagaBinding,
    endpoint: GoogleEndpoint
  ) => Promise<calendar_v3.Calendar>;
  capabilities?: ProviderSagaCapabilities;
}): ProviderSagaAdapter {
  const capabilities = args.capabilities ?? {};
  async function client(binding: SagaBinding, endpoint: GoogleEndpoint) {
    await args.access.assertAllowed(binding);
    return args.resolveGoogle(binding, endpoint);
  }
  async function writable(binding: SagaBinding, endpoint: GoogleEndpoint) {
    try {
      const calendar = await client(binding, endpoint);
      const { data } = await calendar.calendarList.get({
        calendarId: endpoint.identity.calendarId,
      });
      if (
        !data.id ||
        (endpoint.identity.calendarId !== 'primary' &&
          data.id !== endpoint.identity.calendarId) ||
        !['writer', 'owner'].includes(data.accessRole ?? '')
      )
        throw failure('unauthorized');
    } catch (error) {
      if (error instanceof ColorOperationError) throw error;
      throw failure(
        [401, 403, 404, 410].includes(status(error) ?? 0)
          ? 'unauthorized'
          : 'unavailable'
      );
    }
  }
  async function observe(
    rawBinding: SagaBinding,
    rawEndpoint: SagaEndpoint,
    eventId?: string
  ): Promise<SagaObservation> {
    const binding = SagaBindingSchema.parse(rawBinding);
    const endpoint = admittedEndpoint(binding, rawEndpoint);
    const id = eventId ?? endpoint.identity.providerEventId;
    if (!id || id !== endpoint.identity.providerEventId)
      throw failure('identity');
    // A missing event is meaningful only after fresh provider calendar write
    // authorization. Missing/revoked calendars are never treated as deletion.
    await writable(binding, endpoint);
    try {
      const calendar = await client(binding, endpoint);
      const { data } = await calendar.events.get({
        calendarId: endpoint.identity.calendarId,
        eventId: id,
      });
      return observation(data, id);
    } catch (error) {
      if (error instanceof ColorOperationError) throw error;
      if ([404, 410].includes(status(error) ?? 0)) return { absent: true };
      throw failure(
        [401, 403].includes(status(error) ?? 0) ? 'unauthorized' : 'unavailable'
      );
    }
  }
  function ownedTarget(binding: SagaBinding, target: SagaObservation): Present {
    if (target.absent) throw failure('unavailable');
    if (target.marker !== binding.operationId) throw failure('identity');
    return target;
  }
  async function remove(
    binding: SagaBinding,
    endpoint: GoogleEndpoint,
    etag: string,
    sendUpdates: SagaPayload['sendUpdates']
  ) {
    await writable(binding, endpoint);
    try {
      const calendar = await client(binding, endpoint);
      await calendar.events.delete(
        {
          calendarId: endpoint.identity.calendarId,
          eventId: endpoint.identity.providerEventId!,
          sendUpdates,
        },
        { headers: { 'If-Match': etag } }
      );
    } catch (error) {
      if (error instanceof ColorOperationError) throw error;
      if (status(error) === 412) throw failure('conflict');
      // Recover a lost successful DELETE only through an authorized observation.
      // A live source with a new ETag conflicts; no new version is adopted.
      const current = await observe(binding, endpoint);
      if (current.absent) return;
      if (current.etag !== etag) throw failure('conflict');
      throw failure(
        [401, 403].includes(status(error) ?? 0) ? 'unauthorized' : 'unavailable'
      );
    }
  }
  return {
    observe,
    async insert(rawBinding: SagaBinding, rawPayload: SagaPayload) {
      const binding = SagaBindingSchema.parse(rawBinding);
      if (!capabilities.googleInsert || binding.mode === 'google-move')
        throw failure('unavailable');
      const endpoint = admittedEndpoint(binding, binding.destination);
      const payload = SagaPayloadSchema.parse(rawPayload);
      const existing = await observe(binding, endpoint);
      if (!existing.absent) return ownedTarget(binding, existing);
      const event = payload.event as calendar_v3.Schema$Event;
      const requestBody: calendar_v3.Schema$Event = {
        ...event,
        id: endpoint.identity.providerEventId,
        extendedProperties: {
          ...event.extendedProperties,
          private: {
            ...event.extendedProperties?.private,
            [SAGA_OPERATION_MARKER]: binding.operationId,
          },
        },
      };
      try {
        const calendar = await client(binding, endpoint);
        await calendar.events.insert({
          calendarId: endpoint.identity.calendarId,
          requestBody,
          sendUpdates: payload.sendUpdates,
        });
      } catch (error) {
        if (error instanceof ColorOperationError) throw error;
        // No repeat write in this invocation. Even a409/timeout must observe the
        // immutable deterministic ID and private marker before being recovered.
        const recovered = await observe(binding, endpoint);
        if (!recovered.absent) return ownedTarget(binding, recovered);
        throw failure(
          [401, 403].includes(status(error) ?? 0)
            ? 'unauthorized'
            : 'unavailable'
        );
      }
      return ownedTarget(binding, await observe(binding, endpoint));
    },
    async move(rawBinding: SagaBinding, rawPayload: SagaPayload) {
      const binding = SagaBindingSchema.parse(rawBinding);
      const payload = SagaPayloadSchema.parse(rawPayload);
      if (
        !capabilities.googleMove ||
        binding.mode !== 'google-move' ||
        !binding.source ||
        !binding.baseETag ||
        !payload.sourceICalUID ||
        Object.keys(payload.event).length > 0
      )
        throw failure('unavailable');
      const source = admittedEndpoint(binding, binding.source);
      const destination = admittedEndpoint(binding, binding.destination);
      const inspect = async () => {
        const original = await observe(binding, source);
        const target = await observe(binding, destination);
        if (original.absent && !target.absent) {
          if (target.event.iCalUID !== payload.sourceICalUID)
            throw failure('identity');
          return { recovered: target, original, target };
        }
        return { recovered: null, original, target };
      };
      const initial = await inspect();
      if (initial.recovered) return initial.recovered;
      if (initial.original.absent) throw failure('unavailable');
      if (!initial.target.absent) throw failure('conflict');
      if (initial.original.event.iCalUID !== payload.sourceICalUID)
        throw failure('identity');
      if (initial.original.etag !== binding.baseETag) throw failure('conflict');
      // Attendee notification behavior has not passed provider acceptance.
      if (
        Array.isArray(initial.original.event.attendees) &&
        initial.original.event.attendees.length > 0
      )
        throw failure('unavailable');
      try {
        const calendar = await client(binding, source);
        await calendar.events.move(
          {
            calendarId: source.identity.calendarId,
            eventId: source.identity.providerEventId!,
            destination: destination.identity.calendarId,
            sendUpdates: payload.sendUpdates,
          },
          { headers: { 'If-Match': binding.baseETag } }
        );
      } catch (error) {
        if (error instanceof ColorOperationError) throw error;
        const after = await inspect();
        if (after.recovered) return after.recovered;
        if (
          status(error) === 412 ||
          (!after.original.absent && after.original.etag !== binding.baseETag)
        )
          throw failure('conflict');
        throw failure(
          [401, 403].includes(status(error) ?? 0)
            ? 'unauthorized'
            : 'unavailable'
        );
      }
      const after = await inspect();
      if (!after.recovered) throw failure('unavailable');
      return after.recovered;
    },
    async deleteSource(rawBinding: SagaBinding, rawPayload: SagaPayload) {
      const binding = SagaBindingSchema.parse(rawBinding);
      if (
        !capabilities.googleConditionalDelete ||
        !binding.source ||
        !binding.baseETag
      )
        throw failure('unavailable');
      const endpoint = admittedEndpoint(binding, binding.source);
      await remove(
        binding,
        endpoint,
        binding.baseETag,
        SagaPayloadSchema.parse(rawPayload).sendUpdates
      );
    },
    async removeTarget(rawBinding: SagaBinding, checkpoint: SagaCheckpoint) {
      const binding = SagaBindingSchema.parse(rawBinding);
      if (!capabilities.googleConditionalDelete) throw failure('unavailable');
      const endpoint = admittedEndpoint(binding, binding.destination);
      if (
        !checkpoint.targetETag ||
        checkpoint.targetEventId !== endpoint.identity.providerEventId
      )
        throw failure('identity');
      const current = await observe(binding, endpoint);
      if (current.absent) return;
      ownedTarget(binding, current);
      if (current.etag !== checkpoint.targetETag) throw failure('conflict');
      await remove(binding, endpoint, checkpoint.targetETag, 'none');
    },
  };
}
