import { createHash } from 'node:crypto';
import {
  type CalendarInvitation,
  calendarRecurrenceIdentity,
} from './calendar-invitation';

export type CalendarOccurrenceIdentity = {
  value: string;
  valueType: 'DATE' | 'DATE-TIME';
  timezone: string | null;
} | null;
export type MailInvitationIdentity = {
  actorId: string;
  mailboxId: string;
  uid: string;
  organizer: string;
  attendee: string;
  occurrence: CalendarOccurrenceIdentity;
};
export type CalendarLinkTargetIdentity = {
  workspaceId: string;
  eventId: string;
  provider: 'tuturuuu' | 'google' | 'microsoft';
  calendarId: string;
  connectionId: string | null;
  accountOwnerId: string | null;
  externalEventId: string | null;
  occurrence: CalendarOccurrenceIdentity;
};
export type AuthorizedCalendarLinkTarget = {
  identity: CalendarLinkTargetIdentity;
  title: string;
  organizer: string | null;
  attendees: string[];
  location: string;
  joinUrl: string | null;
  start: string;
  end: string;
  accountLabel: string;
};
export type MailCalendarAssociation = {
  invitation: MailInvitationIdentity;
  sequence: number;
  target: CalendarLinkTargetIdentity;
  receipt: string;
  authorityReceipt: string;
};
export type CalendarLinkPreview = {
  invitation: MailInvitationIdentity;
  sequence: number;
  original: Pick<
    CalendarInvitation,
    'summary' | 'when' | 'location' | 'joinUrl'
  >;
  target: AuthorizedCalendarLinkTarget;
  existingTarget: CalendarLinkTargetIdentity | null;
  existingReceipt: string;
  authorityReceipt: string;
  receipt: string;
};

/** Only validated scheduling REQUESTs supply this input; never title/time matching. */
export function invitationLinkIdentity(
  actorId: string,
  mailboxId: string,
  invitation: CalendarInvitation
): MailInvitationIdentity {
  return {
    actorId,
    mailboxId,
    uid: invitation.uid,
    organizer: invitation.organizer,
    attendee: invitation.attendee,
    occurrence: calendarRecurrenceIdentity(invitation.recurrence),
  };
}
function occurrenceTuple(occurrence: CalendarOccurrenceIdentity) {
  return occurrence
    ? [occurrence.value, occurrence.valueType, occurrence.timezone]
    : null;
}
function invitationTuple(identity: MailInvitationIdentity) {
  return [
    identity.actorId,
    identity.mailboxId,
    identity.uid,
    identity.organizer,
    identity.attendee,
    occurrenceTuple(identity.occurrence),
  ];
}
function targetTuple(target: CalendarLinkTargetIdentity) {
  return [
    target.workspaceId,
    target.eventId,
    target.provider,
    target.calendarId,
    target.connectionId,
    target.accountOwnerId,
    target.externalEventId,
    occurrenceTuple(target.occurrence),
  ];
}
function targetAuthorityTuple(target: AuthorizedCalendarLinkTarget) {
  return [
    targetTuple(target.identity),
    target.title,
    target.organizer,
    [...target.attendees].sort(),
    target.location,
    target.joinUrl,
    target.start,
    target.end,
    target.accountLabel,
  ];
}
export function invitationAssociationKey(identity: MailInvitationIdentity) {
  return digest(invitationTuple(identity));
}
function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function sameTarget(
  a: CalendarLinkTargetIdentity,
  b: CalendarLinkTargetIdentity
) {
  return digest(targetTuple(a)) === digest(targetTuple(b));
}

function associationReceipt(saved: MailCalendarAssociation | null) {
  return digest(
    saved
      ? [
          invitationAssociationKey(saved.invitation),
          saved.sequence,
          targetTuple(saved.target),
          saved.receipt,
          saved.authorityReceipt,
        ]
      : null
  );
}

export interface CalendarLinkDependencies {
  /** Must use Mail's existing mailbox role, actor, latest REQUEST and attachment checks. */
  readInvitation: (
    actorId: string,
    mailboxId: string,
    messageId: string
  ) => Promise<CalendarInvitation | null>;
  /** Calendar owns visibility, provider-account authorization and decryption. */
  readTarget: (
    actorId: string,
    workspaceId: string,
    eventId: string
  ) => Promise<AuthorizedCalendarLinkTarget | null>;
  readAssociation: (
    actorId: string,
    key: string
  ) => Promise<MailCalendarAssociation | null>;
  /** Atomic actor-scoped compare-and-swap; modifies only link metadata, never events. */
  saveAssociation: (
    actorId: string,
    key: string,
    expected: MailCalendarAssociation | null,
    next: MailCalendarAssociation | null
  ) => Promise<boolean>;
}
export type CalendarLinkSelection = {
  actorId: string;
  mailboxId: string;
  messageId: string;
  workspaceId: string;
  eventId: string;
};
export type CalendarLinkResult =
  | { status: 'linked'; association: MailCalendarAssociation }
  | { status: 'unavailable' | 'changed' | 'conflict' };

/** Non-destructive linking: organizer ownership and RSVP remain on the invitation. */
export function createCalendarLinkService(deps: CalendarLinkDependencies) {
  async function preview(
    selection: CalendarLinkSelection
  ): Promise<CalendarLinkPreview | null> {
    const source = await deps.readInvitation(
      selection.actorId,
      selection.mailboxId,
      selection.messageId
    );
    if (!source) return null;
    const target = await deps.readTarget(
      selection.actorId,
      selection.workspaceId,
      selection.eventId
    );
    if (
      !target ||
      target.identity.workspaceId !== selection.workspaceId ||
      target.identity.eventId !== selection.eventId
    )
      return null;
    if (
      target.identity.provider !== 'tuturuuu' &&
      (target.identity.accountOwnerId !== selection.actorId ||
        !target.identity.connectionId ||
        !target.identity.externalEventId ||
        !target.identity.calendarId)
    )
      return null;
    const invitation = invitationLinkIdentity(
      selection.actorId,
      selection.mailboxId,
      source
    );
    const saved = await deps.readAssociation(
      selection.actorId,
      invitationAssociationKey(invitation)
    );
    if (
      saved &&
      (invitationAssociationKey(saved.invitation) !==
        invitationAssociationKey(invitation) ||
        source.sequence < saved.sequence)
    )
      return null;
    const original = {
      summary: source.summary,
      when: source.when,
      location: source.location,
      joinUrl: source.joinUrl,
    };
    const authorityReceipt = digest([
      invitationTuple(invitation),
      source.sequence,
      [original.summary, original.when, original.location, original.joinUrl],
      targetAuthorityTuple(target),
    ]);
    const existingReceipt = associationReceipt(saved);
    return {
      invitation,
      sequence: source.sequence,
      original,
      target,
      existingTarget: saved?.target ?? null,
      existingReceipt,
      authorityReceipt,
      receipt: digest([authorityReceipt, existingReceipt]),
    };
  }
  async function confirm(
    selection: CalendarLinkSelection,
    receipt: string
  ): Promise<CalendarLinkResult> {
    // Re-read both authorities: a preview is never a permission or ownership grant.
    const fresh = await preview(selection);
    if (!fresh) return { status: 'unavailable' };
    const key = invitationAssociationKey(fresh.invitation);
    const previous = await deps.readAssociation(selection.actorId, key);
    if (previous && invitationAssociationKey(previous.invitation) !== key)
      return { status: 'unavailable' };
    if (associationReceipt(previous) !== fresh.existingReceipt)
      return { status: 'changed' };
    if (previous && previous.sequence > fresh.sequence)
      return { status: 'changed' };
    if (
      previous &&
      previous.receipt === receipt &&
      previous.authorityReceipt === fresh.authorityReceipt &&
      sameTarget(previous.target, fresh.target.identity) &&
      previous.sequence === fresh.sequence
    )
      return { status: 'linked', association: previous };
    if (fresh.receipt !== receipt) return { status: 'changed' };
    const next = {
      invitation: fresh.invitation,
      sequence: fresh.sequence,
      target: fresh.target.identity,
      receipt,
      authorityReceipt: fresh.authorityReceipt,
    };
    return (await deps.saveAssociation(selection.actorId, key, previous, next))
      ? { status: 'linked', association: next }
      : { status: 'conflict' };
  }
  async function linkedTarget(
    actorId: string,
    mailboxId: string,
    messageId: string
  ) {
    const source = await deps.readInvitation(actorId, mailboxId, messageId);
    if (!source) return null;
    const key = invitationAssociationKey(
      invitationLinkIdentity(actorId, mailboxId, source)
    );
    const saved = await deps.readAssociation(actorId, key);
    if (
      !saved ||
      invitationAssociationKey(saved.invitation) !== key ||
      source.sequence < saved.sequence
    )
      return null;
    const target = await deps.readTarget(
      actorId,
      saved.target.workspaceId,
      saved.target.eventId
    );
    // Renamed events remain linked; moved calendars/accounts/occurrences require a new preview.
    return target && sameTarget(saved.target, target.identity) ? target : null;
  }
  async function unlink(
    actorId: string,
    mailboxId: string,
    messageId: string,
    expectedTarget: CalendarLinkTargetIdentity
  ): Promise<{ status: 'unlinked' | 'unavailable' | 'changed' | 'conflict' }> {
    const source = await deps.readInvitation(actorId, mailboxId, messageId);
    if (!source) return { status: 'unavailable' };
    const key = invitationAssociationKey(
      invitationLinkIdentity(actorId, mailboxId, source)
    );
    const previous = await deps.readAssociation(actorId, key);
    if (!previous) return { status: 'unlinked' };
    if (invitationAssociationKey(previous.invitation) !== key)
      return { status: 'unavailable' };
    if (
      previous.sequence > source.sequence ||
      !sameTarget(previous.target, expectedTarget)
    )
      return { status: 'changed' };
    // Revoked Calendar visibility need not prevent deleting one's own link metadata.
    // This never reads or mutates the Calendar event.
    return (await deps.saveAssociation(actorId, key, previous, null))
      ? { status: 'unlinked' }
      : { status: 'conflict' };
  }
  return { preview, confirm, linkedTarget, unlink };
}
