import { formatEventForDb } from '@tuturuuu/trigger/google-calendar-sync';
import type { GoogleColorContext } from '@tuturuuu/utils/google-calendar-colors';
import {
  encryptEventForStorage,
  getWorkspaceKey,
} from '../../workspace-encryption';
import type { GoogleMutationCompletion } from './mutation-executor';
import {
  COLOR_OPERATION_MARKER,
  type ColorOperationAccess,
  ColorOperationError,
  type ColorOperationIdentity,
} from './protocol';

/** Only an authoritative read is projected, never the saved request body.
 * Missing workspace keys fail closed; projection cannot create a replacement key
 * that would leave the original encrypted operation unrecoverable. */
export function createGoogleMutationProjection(args: {
  access: ColorOperationAccess;
  colorContext?: GoogleColorContext;
  getKey?: typeof getWorkspaceKey;
}) {
  return async (
    completion: GoogleMutationCompletion,
    identity: ColorOperationIdentity
  ) => {
    await args.access.assertAllowed(identity);
    if (completion.deleted) return completion;
    const event = completion.event;
    if (
      event.id !== identity.providerEventId ||
      !event.etag ||
      !(event.start?.date || event.start?.dateTime) ||
      !(event.end?.date || event.end?.dateTime)
    )
      throw new ColorOperationError(
        'identity',
        'Google projection unavailable'
      );
    const key = await (args.getKey ?? getWorkspaceKey)(identity.wsId);
    if (!Buffer.isBuffer(key) || key.length !== 32)
      throw new ColorOperationError('unavailable', 'Workspace key unavailable');
    const formatted = formatEventForDb(
      event,
      identity.wsId,
      identity.calendarId,
      {
        ...args.colorContext,
        calendarId: identity.calendarId,
      }
    );
    const projection = await encryptEventForStorage(
      identity.wsId,
      {
        title: formatted.title,
        description: formatted.description,
        location: formatted.location,
        start_at: formatted.start_at,
        end_at: formatted.end_at,
      },
      key
    );
    await args.access.assertAllowed(identity);
    return {
      deleted: false,
      outcome: completion.outcome,
      etag: event.etag,
      operationMarker:
        event.extendedProperties?.private?.[COLOR_OPERATION_MARKER] ?? null,
      compatibilityColor: formatted.color,
      metadata: { google_color: formatted.scheduling_metadata.google_color },
      projection: {
        ...projection,
        ...(completion.outcome === 'applied' ? completion.localPatch : {}),
      },
    };
  };
}
