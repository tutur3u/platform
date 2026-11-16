import type { CalendarInvitationCapabilities } from '@tuturuuu/internal-api/calendar-invitation-capabilities';
import type { CalendarSourceOption } from '@tuturuuu/internal-api';
import type { MeetingInvitationInput } from '@tuturuuu/types/primitives/meeting-invitations';
import { MeetingInvitationInputSchema } from '@tuturuuu/utils/meeting-invitations';
import { describe, expect, it } from 'vitest';
import { createCalendarDraftRecovery } from '../components/ui/legacy/calendar/calendar-draft-recovery';
import {
  eventModalSavePayload,
  eventSavePayload,
} from '../components/ui/legacy/calendar/event-save-payload';
import {
  createCalendarCreationRequests,
  newCalendarCreationRequestId,
} from './calendar-creation-request';
import {
  calendarEventCreatePayload,
  canInviteCalendarGuests,
  type CalendarEventCreationInput,
} from './calendar-event-create-payload';
import {
  calendarEventUpdatePayload,
  cleanCalendarEventUpdates,
} from './calendar-event-write-payload';

const invitation: MeetingInvitationInput = {
  guests: [{ email: 'guest@example.invalid', name: 'Guest' }],
  timeZone: 'Asia/Ho_Chi_Minh',
};
const sourceOption: CalendarSourceOption = {
  id: 'google-1',
  provider: 'google',
  connectionId: 'connection-1',
  writable: true,
  workspaceCalendarId: null,
  externalCalendarId: 'primary',
  accessRole: 'owner',
  accountEmail: 'host@example.invalid',
  accountName: 'Host',
  label: 'Google',
  color: null,
};
const capabilityOption: CalendarInvitationCapabilities = {
  provider: 'google',
  invitationCreates: true,
  connectionId: 'connection-1',
  calendarId: 'primary',
};
const meetingDraft: CalendarEventCreationInput = {
  title: 'Synthetic meeting',
  start_at: '2026-11-16T10:00:00.000Z',
  end_at: '2026-11-16T11:00:00.000Z',
  source: { provider: 'google', connectionId: 'connection-1' },
  invitation,
};

const draft = meetingDraft;

describe('calendar contact invitations', () => {
  it.each(['google', 'microsoft'] as const)(
    'preserves %s guests through the modal save and actual create whitelist',
    (provider) => {
      const draft = {
        ...meetingDraft,
        source: { provider, connectionId: 'connection-1' },
      };
      const modalPayload = eventModalSavePayload(
        draft,
        { id: 'new' },
        draft.source,
        false
      );
      const payload = calendarEventCreatePayload(
        { ...draft, ...modalPayload },
        draft.start_at,
        draft.end_at
      );
      expect(payload.invitation).toEqual(invitation);
      expect(MeetingInvitationInputSchema.parse(payload.invitation)).toEqual(
        invitation
      );
    }
  );

  it.each(['google', 'microsoft'] as const)(
    'retains the same UUIDv7 and %s invitation snapshot across uncertain retries',
    (provider) => {
      const draft = {
        ...meetingDraft,
        source: { provider, connectionId: 'connection-1' },
      };
      const requestId = newCalendarCreationRequestId();
      expect(requestId.split('-')[2]?.[0]).toBe('7');
      const recovery = createCalendarDraftRecovery();
      const submitted = recovery.capture(draft, requestId, true);
      const changedDraft = {
        ...draft,
        invitation: {
          ...invitation,
          guests: [{ email: 'other@example.invalid' }],
        },
      };
      expect(recovery.capture(changedDraft, requestId, true)).toBe(submitted);
      expect(submitted.payload.invitation).toEqual(invitation);
      const input: CalendarEventCreationInput = {
        ...draft,
        ...submitted.payload,
      };
      const payload = calendarEventCreatePayload(
        input,
        input.start_at,
        input.end_at
      );
      const requests = createCalendarCreationRequests();
      expect(requests.forAttempt(payload, submitted.requestId)).toBe(requestId);
      expect(requests.forAttempt(payload, submitted.requestId)).toBe(requestId);
      expect(() =>
        requests.forAttempt(
          { ...payload, invitation: changedDraft.invitation },
          requestId
        )
      ).toThrow('draft changed');
    }
  );

  it('does not silently discard guests during an unsupported existing-event edit', () => {
    expect(() => eventSavePayload(draft, { id: 'saved' })).toThrow(
      'Attendee editing'
    );
    expect(() => calendarEventUpdatePayload(draft)).toThrow('Attendee editing');
    expect(() => cleanCalendarEventUpdates(draft)).toThrow('Attendee editing');
  });

  it.each(['google', 'microsoft'] as const)(
    'requires a verified matching flag-OFF %s source',
    (provider) => {
      const source = { ...sourceOption, provider };
      const capabilities = { ...capabilityOption, provider };
      const input = { source, capabilities, timeZone: invitation.timeZone };
      expect(canInviteCalendarGuests(input)).toBe(true);
      expect(
        canInviteCalendarGuests({ ...input, capabilities: undefined })
      ).toBe(false);
      expect(
        canInviteCalendarGuests({
          ...input,
          capabilities: { ...capabilities, invitationCreates: false },
        })
      ).toBe(false);
      expect(
        canInviteCalendarGuests({
          ...input,
          capabilities: { ...capabilities, connectionId: 'other' },
        })
      ).toBe(false);
      expect(
        canInviteCalendarGuests({
          ...input,
          capabilities: {
            ...capabilities,
            provider: provider === 'google' ? 'microsoft' : 'google',
          },
        })
      ).toBe(false);
      expect(
        canInviteCalendarGuests({
          ...input,
          source: { ...source, writable: false },
        })
      ).toBe(false);
      expect(canInviteCalendarGuests({ ...input, timeZone: undefined })).toBe(
        false
      );
      expect(
        canInviteCalendarGuests({
          ...input,
          capabilities: { ...capabilities, calendarId: 'foreign' },
        })
      ).toBe(false);
      expect(
        canInviteCalendarGuests({
          ...input,
          providerColor: { connectionId: 'connection-1', kind: 'inherit' },
        })
      ).toBe(false);
      expect(
        canInviteCalendarGuests({
          ...input,
          source: { ...source, accountEmail: null },
        })
      ).toBe(false);
    }
  );

  it('refuses native or provider-color creates carrying invitations', () => {
    expect(() =>
      calendarEventCreatePayload(
        { ...draft, source: { provider: 'tuturuuu' } },
        draft.start_at,
        draft.end_at
      )
    ).toThrow('supported connected');
    expect(() =>
      calendarEventCreatePayload(
        {
          ...draft,
          providerColor: { connectionId: 'connection-1', kind: 'inherit' },
        },
        draft.start_at,
        draft.end_at
      )
    ).toThrow('supported connected');
  });
});
