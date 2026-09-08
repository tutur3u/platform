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
export const meetRoomSettingsSchema = z.object({
  shareNotes: z.boolean().default(false),
  shareNotesAfterMeeting: z.boolean().optional(),
});
export type MeetRoomSettings = z.infer<typeof meetRoomSettingsSchema>;
export type MeetApprovedParticipant = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
};
