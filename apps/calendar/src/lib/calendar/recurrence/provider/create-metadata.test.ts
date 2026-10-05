import { describe, expect, it } from 'vitest';
import {
  ProviderCreateMetadataSchema,
  providerFutureCreateMetadata,
} from './create-metadata';

const google = {
  id: 'original-master',
  organizer: { self: true, email: 'organizer@example.invalid' },
  attendees: [
    {
      email: 'guest@example.invalid',
      displayName: 'Fixture',
      optional: true,
      responseStatus: 'accepted',
      self: false,
      id: 'provider-only',
      additionalGuests: 2,
    },
  ],
  reminders: {
    useDefault: false,
    overrides: [{ method: 'popup', minutes: 15 }],
  },
  visibility: 'private',
  transparency: 'transparent',
  colorId: '4',
  guestsCanInviteOthers: false,
  guestsCanModify: true,
  guestsCanSeeOtherGuests: false,
  extendedProperties: {
    private: {
      custom: 'retained',
      tuturuuu_series_intent: 'old',
      tuturuuu_generation: 'original-only',
    },
    shared: { custom: 'shared' },
  },
};
const graph = {
  id: 'original-master',
  isOrganizer: true,
  organizer: { emailAddress: { address: 'organizer@example.invalid' } },
  attendees: [
    {
      type: 'optional',
      emailAddress: { address: 'guest@example.invalid', name: 'Fixture' },
      status: { response: 'accepted' },
    },
  ],
  body: { contentType: 'html', content: '<p>Fixture notes</p>' },
  responseRequested: false,
  isReminderOn: true,
  reminderMinutesBeforeStart: 30,
  sensitivity: 'private',
  showAs: 'free',
  categories: ['Fixture'],
  transactionId: 'old',
  singleValueExtendedProperties: [{ id: 'operation-marker', value: 'old' }],
};
describe('future series writable metadata', () => {
  it('retains Google guest rights, reminders, visibility and custom properties without asserting old RSVP replies', () => {
    const result = providerFutureCreateMetadata('google', google);
    expect(result).toEqual({
      provider: 'google',
      fields: {
        attendees: [
          {
            email: 'guest@example.invalid',
            displayName: 'Fixture',
            optional: true,
            additionalGuests: 2,
          },
        ],
        reminders: google.reminders,
        visibility: 'private',
        transparency: 'transparent',
        colorId: '4',
        guestsCanInviteOthers: false,
        guestsCanModify: true,
        guestsCanSeeOtherGuests: false,
        extendedProperties: {
          private: { custom: 'retained' },
          shared: { custom: 'shared' },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('accepted');
    expect(JSON.stringify(result)).not.toContain('original-master');
    expect(JSON.stringify(result)).not.toContain('tuturuuu_generation');
  });
  it('retains Outlook metadata and HTML notes without copying organizer, reply or recovery identities', () => {
    const result = providerFutureCreateMetadata('microsoft', graph);
    expect(result).toEqual({
      provider: 'microsoft',
      fields: {
        attendees: [
          {
            type: 'optional',
            emailAddress: { address: 'guest@example.invalid', name: 'Fixture' },
          },
        ],
        body: graph.body,
        responseRequested: false,
        isReminderOn: true,
        reminderMinutesBeforeStart: 30,
        sensitivity: 'private',
        showAs: 'free',
        categories: ['Fixture'],
      },
    });
    expect(JSON.stringify(result)).not.toContain('accepted');
    expect(JSON.stringify(result)).not.toContain('organizer@example.invalid');
    expect(JSON.stringify(result)).not.toContain('operation-marker');
  });
  it.each([
    { conferenceData: { conferenceId: 'fixture' } },
    { hangoutLink: 'https://meet.google.com/fixture' },
    { eventType: 'focusTime' },
    { attendeesOmitted: true },
    { organizer: { self: false } },
  ])(
    'rejects non-cloneable Google state before any original-series trim: %j',
    (extra) => {
      expect(() =>
        providerFutureCreateMetadata('google', { ...google, ...extra })
      ).toThrow();
    }
  );
  it.each([
    { isOnlineMeeting: true },
    { onlineMeeting: { joinUrl: 'https://teams.microsoft.com/fixture' } },
    { onlineMeetingUrl: 'https://teams.microsoft.com/fixture' },
    { hasAttachments: true },
    { hideAttendees: true },
    { isOrganizer: false },
    { isOrganizer: undefined },
  ])(
    'rejects non-cloneable Outlook state before any original-series trim: %j',
    (extra) => {
      expect(() =>
        providerFutureCreateMetadata('microsoft', { ...graph, ...extra })
      ).toThrow();
    }
  );
  it.each([
    { attendees: {} },
    { attendees: [{ email: 'invalid' }] },
    {
      reminders: {
        useDefault: false,
        overrides: [{ method: 'sms', minutes: 10 }],
      },
    },
    {
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: -1 }],
      },
    },
    { visibility: 'unknown' },
  ])(
    'rejects malformed Google metadata without silently dropping fields: %j',
    (extra) => {
      expect(() =>
        providerFutureCreateMetadata('google', { ...google, ...extra })
      ).toThrow();
    }
  );
  it.each([
    { attendees: [{ type: 'optional', emailAddress: { address: 'invalid' } }] },
    { body: { contentType: 'unknown', content: 'fixture' } },
    { sensitivity: 'unknown' },
    { reminderMinutesBeforeStart: -1 },
    { categories: 'fixture' },
  ])(
    'rejects malformed Outlook metadata without defaulting visibility or reminders: %j',
    (extra) => {
      expect(() =>
        providerFutureCreateMetadata('microsoft', { ...graph, ...extra })
      ).toThrow();
    }
  );
  it('preserves attachment references without copying read-only file IDs or changing Drive permissions', () => {
    const metadata = providerFutureCreateMetadata('google', {
      ...google,
      attachments: [
        {
          fileUrl: 'https://drive.google.com/file/d/fixture',
          title: 'Fixture document',
          mimeType: 'application/pdf',
          fileId: 'read-only-id',
        },
      ],
    });
    expect(metadata.fields).toMatchObject({
      attachments: [
        {
          fileUrl: 'https://drive.google.com/file/d/fixture',
          title: 'Fixture document',
          mimeType: 'application/pdf',
        },
      ],
    });
    expect(JSON.stringify(metadata)).not.toContain('read-only-id');
  });
  it.each([{}, { fileUrl: 'invalid' }, { fileUrl: 42 }])(
    'rejects incomplete attachment references: %j',
    (attachment) => {
      expect(() =>
        providerFutureCreateMetadata('google', {
          ...google,
          attachments: [attachment],
        })
      ).toThrow();
    }
  );
  it('does not allow recovery journal metadata to inject provider IDs or recurrence/time replacements', () => {
    expect(() =>
      ProviderCreateMetadataSchema.parse({
        provider: 'google',
        fields: { id: 'injected', recurrence: ['changed'], start: {} },
      })
    ).toThrow();
    expect(() =>
      ProviderCreateMetadataSchema.parse({
        provider: 'microsoft',
        fields: { transactionId: 'injected', start: {} },
      })
    ).toThrow();
  });
});
