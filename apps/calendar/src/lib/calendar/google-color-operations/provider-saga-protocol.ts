import { z } from 'zod';
import type { ColorOperationIdentity } from './protocol';

export const SAGA_OPERATION_MARKER = 'tuturuuuSagaOperation';
export const SagaConnectionSchema = z
  .object({
    wsId: z.guid(),
    eventId: z.guid(),
    connectionId: z.guid(),
    authTokenId: z.guid(),
    calendarId: z.string().min(1),
    // Graph chooses its event ID. Null means an admitted destination whose ID
    // must be captured in a durable checkpoint; it is never an existing source.
    providerEventId: z.string().min(1).nullable(),
  })
  .strict();
export const SagaEndpointSchema = z.discriminatedUnion('provider', [
  z
    .object({
      provider: z.literal('tuturuuu'),
      wsId: z.guid(),
      eventId: z.guid(),
      workspaceCalendarId: z.guid().nullable(),
    })
    .strict(),
  z
    .object({
      provider: z.literal('google'),
      identity: SagaConnectionSchema,
      workspaceCalendarId: z.guid().nullable(),
    })
    .strict(),
  z
    .object({
      provider: z.literal('microsoft'),
      identity: SagaConnectionSchema,
      workspaceCalendarId: z.guid().nullable(),
    })
    .strict(),
]);
export type SagaEndpoint = z.infer<typeof SagaEndpointSchema>;
export function sagaScope(endpoint: SagaEndpoint) {
  return endpoint.provider === 'tuturuuu' ? endpoint : endpoint.identity;
}
export function sagaGoogleEventId(operationId: string) {
  // Google accepts base32hex characters, not arbitrary UUID punctuation.
  return `tt${z.guid().parse(operationId).replaceAll('-', '').toLowerCase()}`;
}
export const SagaBindingSchema = z
  .object({
    operationId: z.guid(),
    generation: z.string().regex(/^[1-9][0-9]*$/),
    action: z.enum(['create', 'move']),
    mode: z.enum([
      'insert',
      'google-move',
      'copy-delete',
      'external-to-native',
    ]),
    source: SagaEndpointSchema.nullable(),
    destination: SagaEndpointSchema,
    baseETag: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((binding, context) => {
    const invalid = (message: string) =>
      context.addIssue({ code: 'custom', message });
    if (binding.action === 'create' && binding.mode !== 'insert')
      invalid('Creation requires insert mode');
    if (
      binding.mode === 'insert' &&
      binding.destination.provider === 'tuturuuu'
    )
      invalid('Insert requires an external destination');
    if ((binding.action === 'create') !== (binding.source === null))
      invalid('Source must match action');
    const destination = sagaScope(binding.destination);
    if (binding.source) {
      const source = sagaScope(binding.source);
      if (
        source.wsId !== destination.wsId ||
        source.eventId !== destination.eventId
      )
        invalid('Saga crosses local identity');
      if (
        binding.source.provider !== 'tuturuuu' &&
        (!binding.source.identity.providerEventId || !binding.baseETag)
      )
        invalid('Existing source requires original version and event ID');
    } else if (binding.baseETag !== null)
      invalid('Creation has no source version');
    if (binding.mode === 'google-move') {
      if (
        binding.action !== 'move' ||
        binding.source?.provider !== 'google' ||
        binding.destination.provider !== 'google'
      )
        invalid('Google move requires two Google endpoints');
      else if (
        binding.source.identity.authTokenId !==
          binding.destination.identity.authTokenId ||
        binding.source.identity.providerEventId !==
          binding.destination.identity.providerEventId ||
        binding.source.identity.calendarId ===
          binding.destination.identity.calendarId
      )
        invalid('Google move must preserve same-account event identity');
    } else if (
      binding.destination.provider === 'google' &&
      binding.destination.identity.providerEventId !==
        sagaGoogleEventId(binding.operationId)
    )
      invalid('Google destination must use immutable operation ID');
    if (
      binding.mode === 'external-to-native' &&
      (binding.destination.provider !== 'tuturuuu' ||
        !binding.source ||
        binding.source.provider === 'tuturuuu')
    )
      invalid('Native transfer requires an external source');
    if (
      binding.mode === 'insert' &&
      binding.source?.provider !== undefined &&
      binding.source.provider !== 'tuturuuu'
    )
      invalid('Insert cannot silently delete an external source');
    if (
      binding.source?.provider === 'tuturuuu' &&
      binding.destination.provider === 'tuturuuu'
    )
      invalid('Native-only changes do not use provider saga');
  });
export type SagaBinding = z.infer<typeof SagaBindingSchema>;
export const SagaCheckpointSchema = z
  .object({
    step: z.enum(['target-created', 'source-deleted', 'target-removed']),
    targetEventId: z.string().min(1).optional(),
    targetETag: z.string().min(1).optional(),
  })
  .strict();
export type SagaCheckpoint = z.infer<typeof SagaCheckpointSchema>;
export const SagaPayloadSchema = z
  .object({
    // Sensitive intent stays inside the authenticated encrypted journal.
    event: z.record(z.string(), z.unknown()),
    localPatch: z.record(z.string(), z.unknown()),
    sendUpdates: z.enum(['all', 'none', 'externalOnly']),
    eventLabelVersion: z.union([z.literal(0), z.literal(1)]).optional(),
    sourceICalUID: z.string().min(1).optional(),
    sourceSnapshot: z
      .object({
        title: z.string(),
        description: z.string(),
        location: z.string().nullable(),
        start_at: z.string(),
        end_at: z.string(),
        color: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SagaPayload = z.infer<typeof SagaPayloadSchema>;
export type SagaObservation =
  | { absent: true }
  | {
      absent: false;
      eventId: string;
      etag: string;
      marker: string | null;
      event: Record<string, unknown>;
    };

/** A ledger locator is not a fabricated Graph resource ID. Request access must
 * authenticate the endpoint binding and placeholder independently. */
export function sagaLedgerIdentity(
  binding: SagaBinding
): ColorOperationIdentity {
  const endpoint =
    binding.source?.provider !== 'tuturuuu' && binding.source
      ? binding.source
      : binding.destination;
  if (endpoint.provider === 'tuturuuu')
    throw new Error('External ledger endpoint required');
  return {
    ...endpoint.identity,
    providerEventId:
      endpoint.identity.providerEventId ?? `saga:${binding.operationId}`,
  };
}

export interface ProviderSagaAccess {
  assertAllowed(binding: SagaBinding): Promise<void>;
}
export interface ProviderSagaAdapter {
  observe(
    binding: SagaBinding,
    endpoint: SagaEndpoint,
    eventId?: string
  ): Promise<SagaObservation>;
  insert(binding: SagaBinding, payload: SagaPayload): Promise<SagaObservation>;
  move(binding: SagaBinding, payload: SagaPayload): Promise<SagaObservation>;
  deleteSource(binding: SagaBinding, payload: SagaPayload): Promise<void>;
  removeTarget(binding: SagaBinding, checkpoint: SagaCheckpoint): Promise<void>;
}
