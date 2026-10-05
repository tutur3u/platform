import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { calendar_v3 } from '@tuturuuu/google';
import { google } from '@tuturuuu/google';
import { createGraphClient } from '@tuturuuu/microsoft';
import {
  calendarProviderDateTimeLocal,
  toGoogleCalendarRecurrence,
  toGraphCalendarRecurrence,
} from '@tuturuuu/utils/calendar-recurrence';
import { createGoogleAuthClient } from '../../provider-writes';
import type { ResolvedCalendarSource } from '../../source-resolver';
import { verifyFreshProviderConference } from './conference';
import type { ProviderSeriesWriter } from './executor';
import { recoverFailedGoogleConference } from './google-conference-recovery';
import { verifyGraphAttendeePrivacy } from './graph-privacy';
import { googleSeriesPayload, graphSeriesPayload } from './payload';
import type { ProviderSeriesPlan, ProviderSeriesStep } from './plan';

function status(error: unknown): number | undefined {
  const candidate = error as {
    code?: unknown;
    statusCode?: unknown;
    response?: { status?: number };
  };
  return typeof candidate?.code === 'number'
    ? candidate.code
    : typeof candidate?.statusCode === 'number'
      ? candidate.statusCode
      : candidate?.response?.status;
}
function matchingFields(
  event: Record<string, unknown>,
  desired: Record<string, unknown>
): boolean {
  if (
    typeof desired.dateTime === 'string' &&
    typeof desired.timeZone === 'string'
  ) {
    try {
      if (
        typeof event.dateTime !== 'string' ||
        calendarProviderDateTimeLocal(
          {
            dateTime: event.dateTime,
            timeZone:
              typeof event.timeZone === 'string'
                ? event.timeZone
                : desired.timeZone,
          },
          desired.timeZone
        ) !== desired.dateTime
      )
        return false;
      return true;
    } catch {
      return false;
    }
  }
  return Object.entries(desired).every(([key, value]) => {
    const actual = event[key];
    if (
      key === 'contentType' &&
      typeof value === 'string' &&
      typeof actual === 'string'
    )
      return actual.toLowerCase() === value.toLowerCase();
    if (value === '' && (actual === undefined || actual === null)) return true;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return (
        !!actual &&
        typeof actual === 'object' &&
        matchingFields(
          actual as Record<string, unknown>,
          value as Record<string, unknown>
        )
      );
    }
    return isDeepStrictEqual(actual, value);
  });
}
function requestHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Provider IDs and ETags come only from the reserved server plan. Instance
 * targets must already be resolved by immutable original-slot identity. */
export function createSeriesProviderWriter(args: {
  source: ResolvedCalendarSource;
  authorize: () => Promise<void>;
  googleApi?: calendar_v3.Calendar;
  graphApi?: ReturnType<typeof createGraphClient>;
}): ProviderSeriesWriter {
  const source = args.source;
  if (source.provider === 'tuturuuu' || !source.accessToken)
    throw new Error('External calendar credentials unavailable');
  const external = source;
  const calendar =
    source.provider === 'google'
      ? (args.googleApi ??
        google.calendar({
          version: 'v3',
          auth: createGoogleAuthClient(source),
        }))
      : null;
  const graph =
    source.provider === 'microsoft'
      ? (args.graphApi ?? createGraphClient(source.accessToken))
      : null;
  const collection = `/me/calendars/${encodeURIComponent(external.externalCalendarId)}/events`;
  return {
    assertAuthorized: args.authorize,
    async apply(plan, step) {
      if (
        plan.binding &&
        (plan.binding.provider !== source.provider ||
          plan.binding.connectionId !== external.connectionId ||
          plan.binding.calendarId !== external.externalCalendarId)
      )
        throw new Error('Provider series binding changed');
      if (step.kind === 'create') {
        if (calendar) {
          if (step.metadata && step.metadata.provider !== 'google')
            throw new Error('Provider create metadata source changed');
          const payload = {
            ...step.metadata?.fields,
            ...googleSeriesPayload(step.snapshot),
          };
          const hash = requestHash(payload);
          let event: calendar_v3.Schema$Event;
          try {
            event = (
              await calendar.events.insert({
                calendarId: external.externalCalendarId,
                sendUpdates: 'all',
                supportsAttachments: true,
                ...(step.metadata?.excludedConferenceHash
                  ? { conferenceDataVersion: 1 }
                  : {}),
                requestBody: {
                  ...payload,
                  id: step.key,
                  extendedProperties: {
                    ...payload.extendedProperties,
                    private: {
                      ...payload.extendedProperties?.private,
                      tuturuuu_series_intent: hash,
                    },
                  },
                },
              })
            ).data;
          } catch (error) {
            if (status(error) !== 409) throw error;
            event = (
              await calendar.events.get({
                calendarId: external.externalCalendarId,
                eventId: step.key,
              })
            ).data;
            if (
              event.status === 'cancelled' ||
              event.extendedProperties?.private?.tuturuuu_series_intent !== hash
            )
              throw new Error('Provider create identity conflict');
          }
          if (event.id !== step.key || !event.etag)
            throw new Error('Provider create receipt unavailable');
          event = await recoverFailedGoogleConference({
            calendar,
            calendarId: external.externalCalendarId,
            event,
            metadata: step.metadata,
            authorize: args.authorize,
          });
          if (event.id !== step.key || !event.etag)
            throw new Error('Provider create receipt unavailable');
          verifyFreshProviderConference(
            'google',
            event as Record<string, unknown>,
            step.metadata?.excludedConferenceHash,
            step.metadata?.excludedJoinHash
          );
          return { eventId: event.id, etag: event.etag };
        }
        if (step.metadata && step.metadata.provider !== 'microsoft')
          throw new Error('Provider create metadata source changed');
        const base = graphSeriesPayload(step.snapshot);
        const payload = {
          ...step.metadata?.fields,
          ...base,
          body: {
            ...base.body,
            contentType:
              step.metadata?.fields.body?.contentType ?? base.body.contentType,
          },
        };
        const propertyId =
          'String {ea5bd17d-3bea-4f01-8a68-9876dc3970fb} Name tuturuuu_series_operation';
        const fingerprint = requestHash({
          operationId: plan.operationId,
          calendarId: external.externalCalendarId,
          payload,
        });
        const retained = await graph!
          .api(collection)
          .header('Prefer', 'IdType="ImmutableId"')
          .query({
            $filter: `singleValueExtendedProperties/Any(ep: ep/id eq '${propertyId}' and ep/value eq '${fingerprint}')`,
            $top: 2,
          })
          .get();
        if (
          !Array.isArray(retained?.value) ||
          retained['@odata.nextLink'] ||
          retained.value.length > 1
        )
          throw new Error('Provider create identity conflict');
        if (retained.value.length === 1) {
          const event = await graph!
            .api(`${collection}/${encodeURIComponent(retained.value[0].id)}`)
            .header('Prefer', 'IdType="ImmutableId"')
            .get();
          if (
            event.isCancelled ||
            typeof event.id !== 'string' ||
            typeof event['@odata.etag'] !== 'string'
          )
            throw new Error('Provider create receipt unavailable');
          verifyGraphAttendeePrivacy(event, step.metadata);
          verifyFreshProviderConference(
            'microsoft',
            event,
            step.metadata?.excludedConferenceHash,
            step.metadata?.excludedJoinHash,
            step.metadata?.provider === 'microsoft'
              ? step.metadata.fields.onlineMeetingProvider
              : undefined
          );
          return { eventId: event.id, etag: event['@odata.etag'] };
        }
        // The mailbox's configured zones are authoritative; do not fall back to UTC.
        const zones = await graph!
          .api("/me/outlook/supportedTimeZones(TimeZoneStandard='Iana')")
          .get();
        if (
          !Array.isArray(zones?.value) ||
          !zones.value.some(
            (zone: { alias?: string }) =>
              zone.alias === step.snapshot.rule.timeZone
          )
        )
          throw new Error(
            'Outlook mailbox does not support the selected timezone'
          );
        if (step.metadata?.fields.isOnlineMeeting) {
          const parent = await graph!
            .api(
              `/me/calendars/${encodeURIComponent(external.externalCalendarId)}`
            )
            .select('allowedOnlineMeetingProviders')
            .get();
          if (
            !Array.isArray(parent?.allowedOnlineMeetingProviders) ||
            !parent.allowedOnlineMeetingProviders.includes(
              step.metadata.fields.onlineMeetingProvider
            )
          )
            throw new Error(
              'Outlook calendar does not support the meeting provider'
            );
        }
        const event = await graph!
          .api(collection)
          .header('Prefer', 'IdType="ImmutableId"')
          .post({
            ...payload,
            transactionId: plan.operationId,
            singleValueExtendedProperties: [
              { id: propertyId, value: fingerprint },
            ],
          });
        if (
          typeof event?.id !== 'string' ||
          typeof event?.['@odata.etag'] !== 'string'
        )
          throw new Error('Provider create receipt unavailable');
        verifyGraphAttendeePrivacy(event, step.metadata);
        verifyFreshProviderConference(
          'microsoft',
          event,
          step.metadata?.excludedConferenceHash,
          step.metadata?.excludedJoinHash,
          step.metadata?.fields.onlineMeetingProvider
        );
        return { eventId: event.id, etag: event['@odata.etag'] };
      }
      const target = resolveTarget(plan, step);
      const path = `${collection}/${encodeURIComponent(target.id)}`;
      let observed: Record<string, unknown>;
      try {
        observed = calendar
          ? ((
              await calendar.events.get({
                calendarId: external.externalCalendarId,
                eventId: target.id,
              })
            ).data as Record<string, unknown>)
          : await graph!
              .api(path)
              .header('Prefer', 'IdType="ImmutableId"')
              .get();
      } catch (error) {
        if (step.kind === 'delete' && [404, 410].includes(status(error) ?? 0))
          return { eventId: target.id, etag: null, deleted: true };
        throw error;
      }
      if (
        step.kind === 'delete' &&
        (observed.status === 'cancelled' || observed.isCancelled === true)
      )
        return { eventId: target.id, etag: null, deleted: true };
      const observedETag = calendar ? observed.etag : observed['@odata.etag'];
      const payload =
        step.kind === 'delete'
          ? null
          : step.kind === 'trim'
            ? {
                recurrence: calendar
                  ? toGoogleCalendarRecurrence(step.rule, step.anchor)
                  : toGraphCalendarRecurrence(step.rule, step.anchor),
              }
            : calendar
              ? googleSeriesPayload(step.snapshot, step.target === 'occurrence')
              : graphSeriesPayload(step.snapshot, step.target === 'occurrence');
      if (observedETag !== target.etag) {
        // Recover a response lost after a successful patch, without overwriting a
        // subsequent divergent provider edit or repeating an already-complete step.
        if (payload && matchingFields(observed, payload))
          return {
            eventId: target.id,
            etag: typeof observedETag === 'string' ? observedETag : null,
          };
        throw new Error('Provider series revision conflict');
      }
      if (step.kind === 'delete') {
        if (calendar)
          await calendar.events.delete(
            {
              calendarId: external.externalCalendarId,
              eventId: target.id,
              sendUpdates: 'all',
            },
            { headers: { 'If-Match': target.etag } }
          );
        else
          await graph!
            .api(path)
            .header('Prefer', 'IdType="ImmutableId"')
            .header('If-Match', target.etag)
            .delete();
        return { eventId: target.id, etag: null, deleted: true };
      }
      const event = calendar
        ? (
            await calendar.events.patch(
              {
                calendarId: external.externalCalendarId,
                eventId: target.id,
                sendUpdates: 'all',
                requestBody: payload as calendar_v3.Schema$Event,
              },
              { headers: { 'If-Match': target.etag } }
            )
          ).data
        : await graph!
            .api(path)
            .header('Prefer', 'IdType="ImmutableId"')
            .header('If-Match', target.etag)
            .patch(payload);
      const etag = calendar ? event.etag : event['@odata.etag'];
      if (event.id !== target.id || typeof etag !== 'string')
        throw new Error('Provider update receipt unavailable');
      return { eventId: target.id, etag };
    },
  };
}
function resolveTarget(plan: ProviderSeriesPlan, step: ProviderSeriesStep) {
  if (!plan.binding) throw new Error('Provider series identity required');
  if (
    (step.kind === 'update' || step.kind === 'delete') &&
    step.target === 'occurrence'
  ) {
    if (!step.instanceId || !step.instanceETag)
      throw new Error('Resolved provider occurrence identity required');
    return { id: step.instanceId, etag: step.instanceETag };
  }
  return { id: plan.binding.masterId, etag: plan.binding.etag };
}
