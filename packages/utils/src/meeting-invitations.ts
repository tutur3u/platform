import { z } from 'zod';

export const MeetingResponseSchema = z.enum([
  'needsAction',
  'accepted',
  'declined',
  'tentative',
]);
export type MeetingResponse = z.infer<typeof MeetingResponseSchema>;

export const MeetingGuestSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().max(200).optional(),
  optional: z.boolean().optional(),
});

/** Guest responses are provider-owned, never accepted from organizer input. */
export const MeetingInvitationInputSchema = z
  .object({
    guests: z.array(MeetingGuestSchema).min(1).max(100),
    timeZone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Invalid time zone'),
  })
  .superRefine((value, context) => {
    const emails = new Set<string>();
    value.guests.forEach((guest, index) => {
      if (emails.has(guest.email))
        context.addIssue({
          code: 'custom',
          message: 'Duplicate guest',
          path: ['guests', index, 'email'],
        });
      emails.add(guest.email);
    });
  });
export type MeetingInvitationInput = z.infer<
  typeof MeetingInvitationInputSchema
>;

export type MeetingAttendee = z.infer<typeof MeetingGuestSchema> & {
  response: MeetingResponse;
  self?: boolean;
};
export interface MeetingInvitationState {
  organizer: { email: string; name?: string; self: boolean };
  attendees: MeetingAttendee[];
  timeZone?: string;
  iCalUid?: string;
  cancelled: boolean;
}

export function normalizeGoogleResponse(value: unknown): MeetingResponse {
  const parsed = MeetingResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : 'needsAction';
}

export function normalizeMicrosoftResponse(value: unknown): MeetingResponse {
  switch (value) {
    case 'accepted':
    case 'organizer':
      return 'accepted';
    case 'declined':
      return 'declined';
    case 'tentativelyAccepted':
      return 'tentative';
    default:
      return 'needsAction';
  }
}
