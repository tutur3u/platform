import { z } from 'zod';
import {
  assertNoCopiedConferenceLink,
  freshProviderConference,
  GoogleConferenceCreateSchema,
  GraphMeetingProviderSchema,
} from './conference';

const email = z.string().email().max(320);
const nonempty = z.string().min(1).max(2048);
const fields = z.record(z.string().max(128), z.string().max(8192));
const googleAttendee = z
  .object({
    email,
    displayName: z.string().max(2048).optional(),
    optional: z.boolean().optional(),
    resource: z.boolean().optional(),
    additionalGuests: z.number().int().nonnegative().max(1000).optional(),
    comment: z.string().max(8192).optional(),
  })
  .strict();
const googleFields = z
  .object({
    conferenceData: GoogleConferenceCreateSchema.optional(),
    attendees: z.array(googleAttendee).max(1000).optional(),
    attachments: z
      .array(
        z
          .object({
            fileUrl: z.string().url().max(8192),
            title: z.string().max(2048).optional(),
            mimeType: z.string().max(256).optional(),
            iconLink: z.string().url().max(8192).optional(),
          })
          .strict()
      )
      .max(25)
      .optional(),
    reminders: z
      .object({
        useDefault: z.boolean(),
        overrides: z
          .array(
            z
              .object({
                method: z.enum(['email', 'popup']),
                minutes: z.number().int().min(0).max(40320),
              })
              .strict()
          )
          .max(5)
          .optional(),
      })
      .strict()
      .optional(),
    visibility: z
      .enum(['default', 'public', 'private', 'confidential'])
      .optional(),
    transparency: z.enum(['opaque', 'transparent']).optional(),
    colorId: nonempty.optional(),
    guestsCanInviteOthers: z.boolean().optional(),
    guestsCanModify: z.boolean().optional(),
    guestsCanSeeOtherGuests: z.boolean().optional(),
    extendedProperties: z
      .object({ private: fields.optional(), shared: fields.optional() })
      .strict()
      .optional(),
  })
  .strict();
const graphFields = z
  .object({
    hideAttendees: z.boolean().optional(),
    isOnlineMeeting: z.literal(true).optional(),
    onlineMeetingProvider: GraphMeetingProviderSchema.optional(),
    body: z
      .object({
        contentType: z.enum(['text', 'html']),
        content: z.string().max(200000),
      })
      .strict()
      .optional(),
    attendees: z
      .array(
        z
          .object({
            emailAddress: z
              .object({ address: email, name: z.string().max(2048).optional() })
              .strict(),
            type: z.enum(['required', 'optional', 'resource']),
          })
          .strict()
      )
      .max(500)
      .optional(),
    responseRequested: z.boolean().optional(),
    isReminderOn: z.boolean().optional(),
    reminderMinutesBeforeStart: z.number().int().min(0).max(40320).optional(),
    sensitivity: z
      .enum(['normal', 'personal', 'private', 'confidential'])
      .optional(),
    showAs: z
      .enum(['free', 'tentative', 'busy', 'oof', 'workingElsewhere', 'unknown'])
      .optional(),
    categories: z.array(z.string().max(256)).max(100).optional(),
  })
  .strict();
export const ProviderCreateMetadataSchema = z
  .discriminatedUnion('provider', [
    z
      .object({
        provider: z.literal('google'),
        fields: googleFields,
        excludedJoinHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        excludedConferenceHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .strict(),
    z
      .object({
        provider: z.literal('microsoft'),
        fields: graphFields,
        excludedJoinHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        excludedConferenceHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    const hasMeeting =
      value.provider === 'google'
        ? Boolean(value.fields.conferenceData)
        : Boolean(value.fields.isOnlineMeeting);
    if (
      hasMeeting !== Boolean(value.excludedConferenceHash) ||
      hasMeeting !== Boolean(value.excludedJoinHash)
    )
      context.addIssue({
        code: 'custom',
        message: 'Fresh meeting metadata requires prior identity fences',
      });
  });
export type ProviderCreateMetadata = z.infer<
  typeof ProviderCreateMetadataSchema
>;

function pick(value: Record<string, unknown>, names: string[]) {
  return Object.fromEntries(
    names
      .filter((name) => value[name] !== undefined && value[name] !== null)
      .map((name) => [name, value[name]])
  );
}
/** Only fresh authoritative provider fields enter this allowlist. Remote IDs,
 * organizer identity, replies and operation markers must never be cloned into
 * a new future series. Unsupported state is rejected BEFORE the original trim. */
export function providerFutureCreateMetadata(
  provider: 'google' | 'microsoft',
  master: Record<string, unknown>,
  operationId?: string
): ProviderCreateMetadata {
  if (provider === 'google') {
    if (master.eventType !== undefined && master.eventType !== 'default')
      throw new RangeError(
        'Future split does not yet support provider meetings or special events'
      );
    if (
      master.organizer &&
      z.record(z.string(), z.unknown()).parse(master.organizer).self !== true
    )
      throw new RangeError('Future split requires the meeting organizer');
    if (master.attendeesOmitted === true)
      throw new RangeError('Future split requires the complete attendee list');
    const value = pick(master, [
      'reminders',
      'visibility',
      'transparency',
      'colorId',
      'guestsCanInviteOthers',
      'guestsCanModify',
      'guestsCanSeeOtherGuests',
    ]);
    if (master.attendees !== undefined) {
      if (!Array.isArray(master.attendees))
        throw new RangeError('Provider attendees unavailable');
      value.attendees = master.attendees.map((attendee) => {
        const parsed = z.record(z.string(), z.unknown()).parse(attendee);
        return pick(parsed, [
          'email',
          'displayName',
          'optional',
          'resource',
          'additionalGuests',
          'comment',
        ]);
      });
    }
    if (master.attachments !== undefined && master.attachments !== null) {
      if (!Array.isArray(master.attachments))
        throw new RangeError('Provider attachments unavailable');
      value.attachments = master.attachments.map((attachment) =>
        pick(z.record(z.string(), z.unknown()).parse(attachment), [
          'fileUrl',
          'title',
          'mimeType',
          'iconLink',
        ])
      );
    }
    if (master.extendedProperties) {
      const properties = z
        .object({ private: fields.optional(), shared: fields.optional() })
        .parse(master.extendedProperties);
      value.extendedProperties = {
        ...properties,
        ...(properties.private
          ? {
              private: Object.fromEntries(
                Object.entries(properties.private).filter(
                  ([key]) => !key.startsWith('tuturuuu_')
                )
              ),
            }
          : {}),
      };
    }
    const conference = freshProviderConference(provider, master, operationId);
    if (conference) assertNoCopiedConferenceLink(master, value);
    return ProviderCreateMetadataSchema.parse({
      provider,
      fields: { ...value, ...conference?.fields },
      ...(conference
        ? {
            excludedConferenceHash: conference.excludedConferenceHash,
            excludedJoinHash: conference.excludedJoinHash,
          }
        : {}),
    });
  }
  if (master.isOrganizer !== true)
    throw new RangeError('Future split requires the meeting organizer');
  if (master.hideAttendees === true && !Array.isArray(master.attendees))
    throw new RangeError('Hidden Outlook attendees unavailable');
  if (master.hasAttachments === true)
    throw new RangeError(
      'Future split does not yet support Outlook attachments'
    );
  const value = pick(master, [
    'hideAttendees',
    'body',
    'responseRequested',
    'isReminderOn',
    'reminderMinutesBeforeStart',
    'sensitivity',
    'showAs',
    'categories',
  ]);
  if (master.attendees !== undefined) {
    if (!Array.isArray(master.attendees))
      throw new RangeError('Provider attendees unavailable');
    value.attendees = master.attendees.map((attendee) => {
      const parsed = z.record(z.string(), z.unknown()).parse(attendee);
      const address = z
        .record(z.string(), z.unknown())
        .parse(parsed.emailAddress);
      return {
        type: parsed.type,
        emailAddress: pick(address, ['address', 'name']),
      };
    });
  }
  const conference = freshProviderConference(provider, master, operationId);
  if (conference) assertNoCopiedConferenceLink(master, value);
  return ProviderCreateMetadataSchema.parse({
    provider,
    fields: { ...value, ...conference?.fields },
    ...(conference
      ? {
          excludedConferenceHash: conference.excludedConferenceHash,
          excludedJoinHash: conference.excludedJoinHash,
        }
      : {}),
  });
}
