import { z } from 'zod';
import { meetingProgrammingSchema } from './room-programming';

export const meetReactionSchema = z.enum([
  'like',
  'heart',
  'clap',
  'laugh',
  'wow',
  'celebrate',
]);
export type MeetReaction = z.infer<typeof meetReactionSchema>;
export const meetMediaOverrideSchema = z.object({
  mic: z.boolean().optional(),
  camera: z.boolean().optional(),
  screen: z.boolean().optional(),
});
const mediaSettings = {
  micsLocked: z.boolean().optional(),
  camerasLocked: z.boolean().optional(),
  screensLocked: z.boolean().optional(),
  mediaOverrides: z
    .record(z.uuid(), meetMediaOverrideSchema)
    .refine((entries) => Object.keys(entries).length <= 256)
    .optional(),
};
const advancedTools = z.enum(['hosts', 'showcase', 'everyone']).optional();
/** Off: only hosts and co-hosts may send Follow and Summon requests. Unset means on. */
const participantNavigation = z.boolean().optional();
/**
 * The registered tool (`tool:<id>`) that opens for everyone who joins. Null
 * clears it; hosts and co-hosts set it.
 */
const defaultActivity = z
  .string()
  .regex(/^tool:[a-z0-9-]{1,64}$/)
  .nullable()
  .optional();
export const meetRoomSettingsPatchSchema = z.object({
  maxParticipants: z.number().int().min(1).max(100).optional(),
  viewersByDefault: z.boolean().optional(),
  ...mediaSettings,
  transport: z.enum(['media', 'presence']).optional(),
  advancedTools,
  participantNavigation,
  defaultActivity,
  skipLobby: z.boolean().optional(),
  /** Paid hosts only: people without an account join after a Turnstile check. */
  allowAnonymousGuests: z.boolean().optional(),
  admissionClosed: z.boolean().optional(),
  publicLinkPreview: z.boolean().optional(),
  saveChat: z.boolean().optional(),
  shareNotes: z.boolean().optional(),
  shareRecordings: z.boolean().optional(),
  allowParticipantRecording: z.boolean().optional(),
  shareNotesAfterMeeting: z.boolean().optional(),
});
export const meetRoomSettingsSchema = z.object({
  programming: meetingProgrammingSchema.nullable().optional(),
  maxParticipants: z.number().int().min(1).max(100).optional(),
  viewersByDefault: z.boolean().optional(),
  ...mediaSettings,
  transport: z.enum(['media', 'presence']).default('media').optional(),
  advancedTools,
  participantNavigation,
  defaultActivity,
  skipLobby: z.boolean().optional(),
  /** Paid hosts only: people without an account join after a Turnstile check. */
  allowAnonymousGuests: z.boolean().optional(),
  admissionClosed: z.boolean().optional(),
  publicLinkPreview: z.boolean().optional(),
  saveChat: z.boolean().optional(),
  shareNotes: z.boolean().default(false),
  shareRecordings: z.boolean().optional(),
  allowParticipantRecording: z.boolean().optional(),
  shareNotesAfterMeeting: z.boolean().optional(),
});
export type MeetRoomSettings = z.infer<typeof meetRoomSettingsSchema>;
export type MeetApprovedParticipant = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  classMediaRole?: 'viewer' | 'speaker' | 'promoted';
};

export function parseMeetRoomSettingsPatch(
  value: unknown,
  current: MeetRoomSettings = { shareNotes: false }
) {
  return meetRoomSettingsPatchSchema
    .transform((patch) => ({ ...current, ...patch }))
    .safeParse(value);
}
