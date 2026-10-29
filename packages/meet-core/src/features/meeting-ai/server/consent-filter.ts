import {
  readTranscriptSegments,
  readTranscriptSpeaker,
} from '@tuturuuu/ai/meetings/transcript';

/**
 * Keep only speech from consented accounts. Speech whose speaker is unknown
 * cannot be shown to be consented, so it is dropped as well. The room supplies
 * the consent list; nothing here trusts the stored transcript for consent.
 */
export function consentedChunks<
  T extends { transcript: string | null; usage: unknown },
>(chunks: readonly T[], consented: ReadonlySet<string>) {
  const kept: T[] = [];
  let excluded = 0;
  for (const chunk of chunks) {
    const segments = readTranscriptSegments(chunk.usage);
    if (segments.length) {
      const allowed = segments.filter(
        (segment) => segment.speaker && consented.has(segment.speaker.accountId)
      );
      if (allowed.length !== segments.length) excluded++;
      if (!allowed.length) continue;
      kept.push(
        allowed.length === segments.length
          ? chunk
          : {
              ...chunk,
              transcript: allowed.map((segment) => segment.transcript).join(' '),
              usage: { ...(chunk.usage as object), segments: allowed },
            }
      );
      continue;
    }
    const speaker = readTranscriptSpeaker(chunk.usage);
    if (speaker && consented.has(speaker.accountId)) kept.push(chunk);
    else excluded++;
  }
  return { chunks: kept, excluded };
}
