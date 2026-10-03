import { isDeepStrictEqual } from 'node:util';
import type { calendar_v3 } from '@tuturuuu/google';
import { formatEventForDb } from '@tuturuuu/trigger/google-calendar-sync';
import type { GoogleColorContext } from '@tuturuuu/utils/google-calendar-colors';
import { z } from 'zod';
import {
  encryptEventForStorage,
  getWorkspaceKey,
} from '../../workspace-encryption';
import { ColorOperationError } from './protocol';
import type { ProviderSagaCompletion } from './provider-saga-executor';
import { SAGA_OPERATION_MARKER, sagaScope } from './provider-saga-protocol';
import type { createRequestProviderSagaAccess } from './provider-saga-request-access';

const NativeEvent = z.object({
  title: z.string(),
  description: z.string(),
  location: z.string().nullable().optional(),
  start_at: z.string(),
  end_at: z.string(),
  color: z.string().optional(),
});
/** A confirmed native transfer uses only the encrypted immutable native snapshot;
 * provider destinations use their final authoritative observation. */
export function createProviderSagaProjection(args: {
  access: ReturnType<typeof createRequestProviderSagaAccess>;
  googleColorContext?: (
    completion: ProviderSagaCompletion
  ) => Promise<GoogleColorContext>;
  getKey?: typeof getWorkspaceKey;
}) {
  return async (completion: ProviderSagaCompletion) => {
    const { binding, endpoint, observation } = completion;
    await args.access.assertAllowed(binding);
    if (observation?.absent) {
      if (
        completion.outcome !== 'superseded' ||
        binding.mode !== 'copy-delete' ||
        endpoint.provider === 'tuturuuu' ||
        !isDeepStrictEqual(endpoint, binding.source)
      )
        throw new ColorOperationError(
          'identity',
          'Provider saga deletion unavailable'
        );
      await args.access.assertAllowed(binding);
      return { deleted: true, outcome: completion.outcome, endpoint };
    }
    const scope = sagaScope(endpoint);
    const key = await (args.getKey ?? getWorkspaceKey)(scope.wsId);
    if (!Buffer.isBuffer(key) || key.length !== 32)
      throw new ColorOperationError('unavailable', 'Workspace key unavailable');
    let fields: z.infer<typeof NativeEvent>;
    let metadata: Record<string, unknown> = {};
    let compatibilityColor: string | undefined;
    if (endpoint.provider === 'tuturuuu') {
      if (
        completion.outcome !== 'applied' ||
        observation !== null ||
        binding.mode !== 'external-to-native'
      )
        throw new ColorOperationError(
          'identity',
          'Native transfer projection unavailable'
        );
      fields = NativeEvent.parse(completion.sealedEvent);
      compatibilityColor = fields.color;
    } else if (endpoint.provider === 'google') {
      if (
        !observation ||
        observation.absent ||
        !observation.etag ||
        !observation.eventId
      )
        throw new ColorOperationError(
          'identity',
          'Google saga projection unavailable'
        );
      const event = observation.event as calendar_v3.Schema$Event;
      if (
        event.id !== observation.eventId ||
        event.etag !== observation.etag ||
        !(event.start?.date || event.start?.dateTime) ||
        !(event.end?.date || event.end?.dateTime)
      )
        throw new ColorOperationError(
          'identity',
          'Google saga observation changed'
        );
      const formatted = formatEventForDb(
        event,
        scope.wsId,
        endpoint.identity.calendarId,
        args.googleColorContext
          ? await args.googleColorContext(completion)
          : { calendarId: endpoint.identity.calendarId }
      );
      fields = {
        title: formatted.title,
        description: formatted.description,
        location: formatted.location,
        start_at: formatted.start_at,
        end_at: formatted.end_at,
      };
      compatibilityColor = formatted.color;
      metadata = { google_color: formatted.scheduling_metadata.google_color };
    } else
      throw new ColorOperationError(
        'unavailable',
        'Microsoft saga projection unavailable'
      );
    const projection = await encryptEventForStorage(scope.wsId, fields, key);
    const localPatch = z
      .object({ locked: z.boolean().optional() })
      .strict()
      .parse(completion.localPatch);
    await args.access.assertAllowed(binding);
    return {
      outcome: completion.outcome,
      endpoint,
      metadata,
      compatibilityColor,
      ...(observation && !observation.absent
        ? {
            etag: observation.etag,
            providerEventId: observation.eventId,
            operationMarker:
              (observation.event.extendedProperties &&
                (
                  observation.event.extendedProperties as {
                    private?: Record<string, string>;
                  }
                ).private?.[SAGA_OPERATION_MARKER]) ||
              null,
          }
        : {}),
      projection: {
        ...projection,
        ...(completion.outcome === 'applied' ? localPatch : {}),
      },
    };
  };
}
