# Mail–Calendar explicit link and merge preview (stage two)

Status: canonical identity and non-destructive preview/confirmation service implemented
with synthetic fixtures. Calendar authorization endpoint, persistence adapter and
web/mobile entry points await coordinated Calendar file ownership; no live writes.

The Outlook invitation and a user-created personal Google hold can describe the
same meeting while having different organizer and provider identities. Preserve
both source records. Do not re-parent the external invitation or remove either
provider event because titles/times coincide.

## Contract

- Invitation key: authorized account/workspace + mailbox + organizer address +
  iCalendar UID + occurrence (`RECURRENCE-ID`, including TZID/value type).
  Sequence identifies a revision, not a new event. Cancellation supersedes the
  matching occurrence or series; out-of-order updates cannot revert it.
- Calendar key: authorized connection owner/account + provider + external
  calendar ID + external event ID + internal event ID + occurrence.
- Candidate discovery and event preview use Calendar's existing authenticated
  provider/account permission and decryption boundary. Mail must not query an
  admin event table and infer visibility from workspace membership.
- Explicit user confirmation saves a non-destructive association between those
  stable identities. Title/time similarity may suggest candidates, never save a
  link automatically. Preview shows source/account, organizer, invited identity,
  dates/time zones, original location, participants, response and join link.
- RSVP remains addressed to the original invitation organizer as the invited
  mailbox. Linking a self-organized hold does not turn it into an attendee copy
  or grant permission to modify the organizer-owned provider event.
- Opening a confirmed association deep-links to the exact internal Calendar
  event. Recheck event visibility and source identity each time; account switch,
  connection removal and revoked access suppress the link and cached preview.
- Unlink removes only the association. A later destructive merge needs a separate
  explicit preview/confirmation, applicable organizer/provider permissions and
  a recovery path; it is not the default behavior of this feature.

## Required verification

Synthetic Google and Outlook invites; distinct holds with identical titles/times;
series/occurrence updates, cancellations and out-of-order sequences; same UID in
separate accounts; renamed/moved provider events; permission revocation, account
switch, preview cancellation and concurrent confirmations; no duplicate provider
insert, reply or destructive event mutation. Exercise web and Flutter components.


Integration child branch `feat/mail-calendar-integration` inherits reviewed Mail
foundation5671 and final Calendar authority5672 a8e5cd05 unchanged. Owned Mail
routes, concrete actor-scoped metadata CAS adapter and web/mobile controls now
implement preview/confirm/get/unlink; no destructive Calendar operations. Both
clients accept an explicit Calendar permalink, show both authorities before
confirmation and reset state on source scope changes. This is metadata linking,
not a provider event merge. Exact-head integration tests, review and builds remain
required before release; browser build dispatch is blocked on unapproved browser
permissions owned by the parent/user decision.
