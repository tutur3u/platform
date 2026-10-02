import type { calendar_v3 } from '@tuturuuu/google';
import { z } from 'zod';
import {
  COLOR_OPERATION_MARKER,
  type ColorOperationAccess,
  ColorOperationError,
  type ColorOperationIdentity,
  sameColorOperationIdentity,
} from './protocol';
import {
  createSealedMutationCodec,
  type MutationBinding,
  type MutationPayload,
  type SealedMutation,
} from './sealed-mutation';

/** This entire record is immutable once admitted to the durable repository.
 * Sensitive request content and local-only changes are inside the ciphertext.
 * The provider ETag is captured before reservation, never refreshed on replay. */
export type PreparedGoogleMutation = {
  binding: MutationBinding;
  journal: SealedMutation;
};
const EventTime = z
  .object({
    date: z.string().optional(),
    dateTime: z.string().optional(),
    timeZone: z.string().optional(),
  })
  .strict();
const Patch = z
  .object({
    summary: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    start: EventTime.optional(),
    end: EventTime.optional(),
    colorId: z.string().optional(),
    eventLabelId: z.string().optional(),
  })
  .strict();
const LocalPatch = z.object({ locked: z.boolean().optional() }).strict();

export type GoogleMutationObservation =
  | { deleted: true }
  | { deleted: false; event: calendar_v3.Schema$Event };

/** Credentials are always resolved freshly; the persisted record contains none.
 * The repository must mark dispatched before invoking dispatch. Reads and writes
 * deliberately resolve separate clients so revocation is checked between them. */
export function createGoogleMutationProvider(args: {
  access: ColorOperationAccess;
  resolve: (identity: ColorOperationIdentity) => Promise<calendar_v3.Calendar>;
  codec?: ReturnType<typeof createSealedMutationCodec>;
}) {
  const codec =
    args.codec ?? createSealedMutationCodec({ access: args.access });
  async function client(identity: ColorOperationIdentity) {
    await args.access.assertAllowed(identity);
    return args.resolve(identity);
  }
  function missing(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const value = error as { code?: unknown; response?: { status?: unknown } };
    return [404, 410].includes(Number(value.code ?? value.response?.status));
  }
  return {
    async prepare(input: {
      operationId: string;
      generation: string;
      identity: ColorOperationIdentity;
      action: 'patch' | 'delete';
      sendUpdates?: 'all' | 'externalOnly' | 'none';
      providerPatch: Record<string, unknown>;
      localPatch?: { locked?: boolean };
    }): Promise<PreparedGoogleMutation> {
      const providerPatch = Patch.parse(input.providerPatch);
      const localPatch = LocalPatch.parse(input.localPatch ?? {});
      // Fetch before reservation is safe: the repository's generation comparison
      // excludes concurrent local writers; If-Match excludes intervening Google
      // writes. A stale preparation conflicts instead of adopting a newer ETag.
      const calendar = await client(input.identity);
      const { data: current } = await calendar.events.get({
        calendarId: input.identity.calendarId,
        eventId: input.identity.providerEventId,
      });
      if (!current.etag || current.status === 'cancelled')
        throw new ColorOperationError(
          'unavailable',
          'Google version unavailable'
        );
      const binding: MutationBinding = {
        operationId: input.operationId,
        generation: input.generation,
        identity: input.identity,
        action: input.action,
        baseETag: current.etag,
      };
      const payload: MutationPayload = {
        providerPatch:
          input.action === 'delete'
            ? {}
            : {
                ...providerPatch,
                extendedProperties: {
                  // Only the current provider private properties may be copied.
                  // Request-supplied extended properties cannot forge the marker.
                  private: {
                    ...current.extendedProperties?.private,
                    [COLOR_OPERATION_MARKER]: input.operationId,
                  },
                },
              },
        localPatch,
        providerOptions: { sendUpdates: input.sendUpdates ?? 'none' },
      };
      return { binding, journal: await codec.seal(binding, payload) };
    },
    async dispatch(
      identity: ColorOperationIdentity,
      prepared: PreparedGoogleMutation
    ) {
      if (!sameColorOperationIdentity(identity, prepared.binding.identity))
        throw new ColorOperationError(
          'identity',
          'Google mutation scope changed'
        );
      // Every attempt authenticates the full operation/generation/source binding.
      const payload = await codec.open(prepared.binding, prepared.journal);
      const calendar = await client(identity);
      const resource = {
        calendarId: identity.calendarId,
        eventId: identity.providerEventId,
        sendUpdates: payload.providerOptions?.sendUpdates ?? 'none',
      } as const;
      const options = { headers: { 'If-Match': prepared.binding.baseETag } };
      if (prepared.binding.action === 'delete') {
        await calendar.events.delete(resource, options);
      } else {
        await calendar.events.patch(
          {
            ...resource,
            eventLabelVersion: 1,
            requestBody: payload.providerPatch as calendar_v3.Schema$Event,
          },
          options
        );
      }
    },
    async observe(
      identity: ColorOperationIdentity
    ): Promise<GoogleMutationObservation> {
      const calendar = await client(identity);
      try {
        const { data } = await calendar.events.get({
          calendarId: identity.calendarId,
          eventId: identity.providerEventId,
        });
        if (data.status === 'cancelled') return { deleted: true };
        if (!data.etag)
          throw new ColorOperationError(
            'unavailable',
            'Google version unavailable'
          );
        return { deleted: false, event: data };
      } catch (error) {
        if (missing(error)) {
          // Google also returns 404 when calendar access is lost. Confirm that
          // this exact authenticated account still has writable calendar access
          // before treating absence as an authoritative tombstone.
          const { data: calendarEntry } = await calendar.calendarList.get({
            calendarId: identity.calendarId,
          });
          if (!['owner', 'writer'].includes(calendarEntry.accessRole ?? ''))
            throw new ColorOperationError(
              'unauthorized',
              'Google calendar access unavailable'
            );
          return { deleted: true };
        }
        throw error;
      }
    },
    async localIntent(prepared: PreparedGoogleMutation) {
      return LocalPatch.parse(
        (await codec.open(prepared.binding, prepared.journal)).localPatch
      );
    },
    isFencedError(error: unknown) {
      if (!error || typeof error !== 'object') return false;
      const value = error as {
        code?: unknown;
        response?: { status?: unknown };
      };
      return (
        Number(value.code ?? value.response?.status) === 412 || missing(error)
      );
    },
  };
}
