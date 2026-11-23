import type { MeetAiChunk } from '@tuturuuu/internal-api';

type Kind = 'microphone' | 'shared_audio';
type Segment =
  | { erased: true }
  | {
      speaker: { label?: string } | null | undefined;
      kind?: Kind;
      startSeconds: number;
      transcript: string | null;
    };
type Line = TranscriptLine & { label: string | null; kind?: Kind };
export type TranscriptLine = {
  key: string;
  startSeconds: number;
  text: string | null;
  status: string;
};
export type TranscriptBlock = {
  key: string;
  /** Server-resolved speaker label; null for unattributed audio. */
  label: string | null;
  kind?: Kind;
  lines: TranscriptLine[];
};

/** `m:ss`, or `h:mm:ss` from the first hour on. */
export function transcriptTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`;
}

/**
 * Transcript lines in order, grouped into blocks while the same speaker
 * and source keep talking. Only the server-resolved label names a speaker;
 * client display names are never shown. Erased segments never render.
 */
export function transcriptBlocks(chunks: MeetAiChunk[]): TranscriptBlock[] {
  // Chunks arrive in session and time order; sessions restart at zero, so
  // only segments within one chunk are reordered.
  const lines = chunks.flatMap((chunk: MeetAiChunk): Line[] => {
    const segments: Segment[] = chunk.segments?.length
      ? chunk.segments
      : chunk.erased
        ? []
        : [
            {
              speaker: chunk.speaker ?? null,
              kind: chunk.speaker?.kind,
              startSeconds: chunk.start_seconds,
              transcript: chunk.transcript,
            },
          ];
    return segments
      .flatMap((segment: Segment, index: number): Line[] =>
        'startSeconds' in segment
          ? [
              {
                key: `${chunk.id}:${index}`,
                label: segment.speaker?.label ?? null,
                kind: segment.kind,
                startSeconds: segment.startSeconds,
                text: segment.transcript?.trim() ? segment.transcript : null,
                status: chunk.status,
              },
            ]
          : []
      )
      .sort((a: Line, b: Line) => a.startSeconds - b.startSeconds);
  });
  const blocks: TranscriptBlock[] = [];
  for (const line of lines) {
    const last = blocks.at(-1);
    const entry = {
      key: line.key,
      startSeconds: line.startSeconds,
      text: line.text,
      status: line.status,
    };
    if (last && last.label === line.label && last.kind === line.kind)
      last.lines.push(entry);
    else
      blocks.push({
        key: line.key,
        label: line.label,
        kind: line.kind,
        lines: [entry],
      });
  }
  return blocks;
}
