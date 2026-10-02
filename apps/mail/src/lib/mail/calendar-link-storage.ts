import type { MailCalendarAssociation } from '@tuturuuu/internal-api';
import { z } from 'zod';
import { invitationAssociationKey } from './calendar-link';

const occurrence = z
  .object({
    value: z.string(),
    valueType: z.enum(['DATE', 'DATE-TIME']),
    tzid: z.string().nullable(),
  })
  .strict()
  .nullable();
const target = z
  .object({
    workspaceId: z.string(),
    eventId: z.string(),
    provider: z.enum(['tuturuuu', 'google', 'microsoft']),
    actorUserId: z.string(),
    accountOwnerId: z.string().nullable(),
    accountEmail: z.string().nullable(),
    connectionId: z.string().nullable(),
    calendarId: z.string().nullable(),
    sourceCalendarId: z.string().nullable(),
    externalCalendarId: z.string().nullable(),
    externalEventId: z.string().nullable(),
    iCalUid: z.string().nullable(),
    occurrence,
  })
  .strict();
const association = z
  .object({
    invitation: z
      .object({
        actorId: z.string(),
        mailboxId: z.string(),
        uid: z.string(),
        organizer: z.string(),
        attendee: z.string(),
        occurrence,
      })
      .strict(),
    sequence: z.number().int().nonnegative(),
    target,
    receipt: z.string(),
    authorityReceipt: z.string(),
  })
  .strict();
const metadataSchema = z.record(z.string(), z.unknown());
function links(metadata: unknown) {
  const root = metadataSchema.safeParse(metadata);
  const parsed = metadataSchema.safeParse(
    root.success ? root.data.mail_calendar_links : null
  );
  return parsed.success ? parsed.data : {};
}
export function readCalendarAssociation(
  metadata: unknown,
  actor: string,
  key: string
): MailCalendarAssociation | null {
  const parsed = association.safeParse(links(metadata)[key]);
  if (
    !parsed.success ||
    parsed.data.invitation.actorId !== actor ||
    invitationAssociationKey(parsed.data.invitation) !== key
  )
    return null;
  return parsed.data;
}
export function updateCalendarAssociation(
  metadata: unknown,
  actor: string,
  key: string,
  expected: MailCalendarAssociation | null,
  next: MailCalendarAssociation | null
) {
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  const previous = readCalendarAssociation(metadata, actor, key);
  if (
    (previous?.receipt ?? null) !== (expected?.receipt ?? null) ||
    (previous?.authorityReceipt ?? null) !==
      (expected?.authorityReceipt ?? null)
  )
    return null;
  if (
    next &&
    (!association.safeParse(next).success ||
      next.invitation.actorId !== actor ||
      next.target.actorUserId !== actor ||
      invitationAssociationKey(next.invitation) !== key)
  )
    return null;
  const root = metadataSchema.safeParse(metadata);
  if (metadata !== null && !root.success) return null;
  const namespace = root.success ? root.data.mail_calendar_links : undefined;
  if (namespace !== undefined && !metadataSchema.safeParse(namespace).success)
    return null;
  const existing = links(metadata);
  // Unknown or another actor's value may not be overwritten or removed.
  if (existing[key] !== undefined && !previous) return null;
  const updated = { ...existing };
  if (next) updated[key] = next;
  else delete updated[key];
  return { ...(root.success ? root.data : {}), mail_calendar_links: updated };
}
