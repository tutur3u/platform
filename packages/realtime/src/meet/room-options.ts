import { z } from 'zod';

export const meetReactionSchema = z.enum([
  'like',
  'heart',
  'clap',
  'laugh',
  'wow',
  'celebrate',
]);
export type MeetReaction = z.infer<typeof meetReactionSchema>;
export const meetRoomSettingsPatchSchema = z.object({
  saveChat: z.boolean().optional(),
  shareNotes: z.boolean().optional(),
  shareRecordings: z.boolean().optional(),
  allowParticipantRecording: z.boolean().optional(),
  shareNotesAfterMeeting: z.boolean().optional(),
});
export const meetRoomSettingsSchema = z.object({
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
