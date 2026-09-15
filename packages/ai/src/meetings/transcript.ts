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

export const meetTranscriptSegmentSchema = z.object({
  speaker: meetTranscriptSpeakerSchema.nullable(),
  kind: z.enum(['microphone', 'shared_audio']),
  startSeconds: z.number().nonnegative(),
  transcript: z.string(),
});
export function readTranscriptSegments(usage: unknown) {
  const parsed = z
    .object({ segments: z.array(meetTranscriptSegmentSchema) })
    .safeParse(usage);
  return parsed.success ? parsed.data.segments : [];
}
export function transcriptSpeakers(usage: unknown) {
  const speaker = readTranscriptSpeaker(usage);
  return [
    ...(speaker ? [speaker] : []),
    ...readTranscriptSegments(usage).flatMap((segment) =>
      segment.speaker ? [segment.speaker] : []
    ),
  ];
}

export function formatTranscriptChunk(chunk: {
  start_seconds: number;
  transcript: string | null;
  usage: unknown;
}) {
  const segments = readTranscriptSegments(chunk.usage);
  if (segments.length)
    return segments
      .map((segment) =>
        JSON.stringify({
          seconds: segment.startSeconds,
          source: segment.speaker,
          kind: segment.kind,
          text: segment.transcript,
        })
      )
      .join('\n');
  const speaker = readTranscriptSpeaker(chunk.usage);
  return JSON.stringify({
    seconds: chunk.start_seconds,
    source: speaker,
    text: chunk.transcript ?? '[Missing audio segment]',
  });
}
