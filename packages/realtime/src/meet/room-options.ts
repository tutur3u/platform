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
export const meetRoomSettingsPatchSchema = z.object({
  maxParticipants: z.number().int().min(1).max(100).optional(),
  ...mediaSettings,
  skipLobby: z.boolean().optional(),
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
  ...mediaSettings,
  skipLobby: z.boolean().optional(),
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
};

export function parseMeetRoomSettingsPatch(
  value: unknown,
  current: MeetRoomSettings = { shareNotes: false }
) {
  return meetRoomSettingsPatchSchema
    .transform((patch) => ({ ...current, ...patch }))
    .safeParse(value);
}
