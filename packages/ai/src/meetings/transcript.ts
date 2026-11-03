import { z } from 'zod';

const sourceKind = z.enum(['microphone', 'shared_audio']);
export const meetTranscriptSpeakerSchema = z.union([
  z.object({ selector: z.uuid(), kind: sourceKind }),
  z.object({
    accountId: z.uuid(),
    displayName: z.string().trim().min(1).max(320),
    kind: sourceKind,
  }),
]);
export type MeetTranscriptSpeaker = z.infer<typeof meetTranscriptSpeakerSchema>;
const erasedSchema = z.object({ erased: z.literal(true) });
const liveSegmentSchema = z.object({
  speaker: meetTranscriptSpeakerSchema.nullable(),
  kind: sourceKind,
  startSeconds: z.number().nonnegative(),
  transcript: z.string(),
});
export const meetTranscriptSegmentSchema = z.union([
  erasedSchema,
  liveSegmentSchema,
]);

export function hasErasedTranscript(usage: unknown) {
  if (erasedSchema.safeParse(usage).success) return true;
  const parsed = z.object({ segments: z.array(z.unknown()) }).safeParse(usage);
  return (
    parsed.success &&
    parsed.data.segments.some(
      (segment) => erasedSchema.safeParse(segment).success
    )
  );
}

/** Historical mixed chunks deliberately remain unattributed. */
export function readTranscriptSpeaker(usage: unknown) {
  if (hasErasedTranscript(usage)) return null;
  const parsed = z
    .object({ speaker: meetTranscriptSpeakerSchema })
    .safeParse(usage);
  return parsed.success ? parsed.data.speaker : null;
}

export function readTranscriptSegments(usage: unknown) {
  if (erasedSchema.safeParse(usage).success) return [{ erased: true as const }];
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
      !('erased' in segment) && segment.speaker ? [segment.speaker] : []
    ),
  ];
}

export function transcriptSpeakerIdentity(speaker: MeetTranscriptSpeaker) {
  return 'selector' in speaker
    ? speaker
    : { accountId: speaker.accountId, kind: speaker.kind };
}

/** Shared API projection suppresses retained fallback text before serialization. */
export function readTranscriptChunk(
  chunk: { transcript: string | null; usage: unknown },
  roster: ReadonlyMap<string, string> = new Map()
) {
  const resolve = (speaker: MeetTranscriptSpeaker | null) => {
    if (!speaker) return null;
    const identity = transcriptSpeakerIdentity(speaker);
    const id = 'selector' in identity ? identity.selector : identity.accountId;
    const name = roster.get(id);
    if (name === undefined) return null;
    const savedName = name.trim();
    return {
      ...identity,
      label:
        savedName && !/\S+@\S+/.test(savedName) ? savedName : 'Participant',
    };
  };
  return {
    transcript: hasErasedTranscript(chunk.usage) ? '' : chunk.transcript,
    erased: hasErasedTranscript(chunk.usage),
    speaker: resolve(readTranscriptSpeaker(chunk.usage)),
    segments: readTranscriptSegments(chunk.usage).map((segment) =>
      'erased' in segment
        ? segment
        : { ...segment, speaker: resolve(segment.speaker) }
    ),
  };
}

export function formatTranscriptChunk(chunk: {
  start_seconds: number;
  transcript: string | null;
  usage: unknown;
}) {
  const segments = readTranscriptSegments(chunk.usage);
  if (segments.length)
    return segments
      .flatMap((segment) =>
        'erased' in segment
          ? []
          : [
              JSON.stringify({
                seconds: segment.startSeconds,
                source: segment.speaker
                  ? transcriptSpeakerIdentity(segment.speaker)
                  : null,
                kind: segment.kind,
                text: segment.transcript,
              }),
            ]
      )
      .join('\n');
  if (hasErasedTranscript(chunk.usage)) return '';
  const speaker = readTranscriptSpeaker(chunk.usage);
  return JSON.stringify({
    seconds: chunk.start_seconds,
    source: speaker ? transcriptSpeakerIdentity(speaker) : null,
    text: chunk.transcript ?? '[Missing audio segment]',
  });
}

export function resolveTranscriptActionOwners<
  T extends { ownerId?: string | null; owner: string | null },
>(items: T[], roster: ReadonlyMap<string, string>) {
  return items.map((item) => ({
    ...item,
    ownerId: item.ownerId && roster.has(item.ownerId) ? item.ownerId : null,
    owner: item.ownerId ? (roster.get(item.ownerId) ?? null) : null,
  }));
}
