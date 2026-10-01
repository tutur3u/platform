import type { calendar_v3 } from '@tuturuuu/google';
import {
  googleColorCompatibilityValue,
  resolveGoogleEventColor,
} from '@tuturuuu/utils/google-calendar-colors';
import {
  loadGoogleColorOptions,
  resolveGoogleColorChoice,
} from '../google-color-choices';
import type { ResolvedCalendarSource } from '../source-resolver';
import {
  COLOR_OPERATION_MARKER,
  ColorOperationError,
  type ColorOperationIdentity,
  type ColorOperationProvider,
} from './protocol';

/** The resolver must reauthorize/verify the token row on every invocation. */
export function createGoogleColorOperationProvider(
  resolve: (identity: ColorOperationIdentity) => Promise<{
    calendar: calendar_v3.Calendar;
    source: ResolvedCalendarSource;
    verifiedAuthTokenId: string;
  }>
): ColorOperationProvider {
  async function client(identity: ColorOperationIdentity) {
    const result = await resolve(identity);
    if (
      result.verifiedAuthTokenId !== identity.authTokenId ||
      result.source.provider !== 'google' ||
      result.source.connectionId !== identity.connectionId ||
      result.source.externalCalendarId !== identity.calendarId
    )
      throw new ColorOperationError(
        'identity',
        'Google operation source changed'
      );
    // authTokenId/owner verification belongs to resolver; access tokens never
    // enter the operation record, and credential refresh retains exact row ID.
    return result;
  }
  return {
    async prepare(operation) {
      const { calendar, source } = await client(operation.identity);
      const current = await calendar.events.get({
        calendarId: operation.identity.calendarId,
        eventId: operation.identity.providerEventId,
      });
      if (!current.data.etag)
        throw new ColorOperationError(
          'unavailable',
          'Google event version is unavailable'
        );
      const choice = await resolveGoogleColorChoice(
        calendar,
        source,
        operation.intent
      );
      return {
        baseETag: current.data.etag,
        eventLabelVersion: operation.intent.kind === 'event' ? 0 : 1,
        patch: {
          // Clear the opposite choice explicitly. No native enum/title guessing.
          colorId: choice.fields.colorId ?? '',
          eventLabelId: choice.fields.eventLabelId ?? '',
          extendedProperties: {
            private: { ...current.data.extendedProperties?.private },
          },
        },
      };
    },
    async patch(identity, prepared) {
      const { calendar } = await client(identity);
      await calendar.events.patch(
        {
          calendarId: identity.calendarId,
          eventId: identity.providerEventId,
          eventLabelVersion: prepared.eventLabelVersion,
          sendUpdates: 'none',
          requestBody: prepared.patch as calendar_v3.Schema$Event,
        },
        { headers: { 'If-Match': prepared.baseETag } }
      );
    },
    isPreconditionFailure(error) {
      if (!error || typeof error !== 'object') return false;
      const value = error as {
        code?: unknown;
        response?: { status?: unknown };
      };
      return value.code === 412 || value.response?.status === 412;
    },
    async read(identity) {
      const { calendar, source } = await client(identity);
      const current = await calendar.events.get({
        calendarId: identity.calendarId,
        eventId: identity.providerEventId,
      });
      if (!current.data.etag)
        throw new ColorOperationError(
          'unavailable',
          'Google event version is unavailable'
        );
      const { context } = await loadGoogleColorOptions(calendar, source);
      return {
        etag: current.data.etag,
        operationMarker:
          current.data.extendedProperties?.private?.[COLOR_OPERATION_MARKER] ??
          null,
        compatibilityColor: googleColorCompatibilityValue(current.data.colorId),
        metadata: {
          google_color: resolveGoogleEventColor(current.data, context),
        },
      };
    },
  };
}
