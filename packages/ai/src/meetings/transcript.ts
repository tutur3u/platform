import { z } from 'zod';

export const meetTranscriptSpeakerSchema = z.object({
  accountId: z.uuid(),
  displayName: z.string().trim().min(1).max(320),
  kind: z.enum(['microphone', 'shared_audio']),
});
export type MeetTranscriptSpeaker = z.infer<typeof meetTranscriptSpeakerSchema>;

/** Historical mixed chunks deliberately remain unattributed. */
export function readTranscriptSpeaker(usage: unknown) {
  const parsed = z
    .object({ speaker: meetTranscriptSpeakerSchema })
    .safeParse(usage);
  return parsed.success ? parsed.data.speaker : null;
}

export function formatTranscriptChunk(chunk: {
  start_seconds: number;
  transcript: string | null;
  usage: unknown;
}) {
  const speaker = readTranscriptSpeaker(chunk.usage);
  return JSON.stringify({
    seconds: chunk.start_seconds,
    source: speaker,
    text: chunk.transcript ?? '[Missing audio segment]',
  });
}
