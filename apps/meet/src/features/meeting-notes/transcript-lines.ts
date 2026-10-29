import type { MeetAiChunk } from '@tuturuuu/internal-api';

export type TranscriptLine = {
  id: string;
  speaker: string | null;
  kind: 'microphone' | 'shared_audio' | null;
  startSeconds: number;
  text: string;
  status: string;
};

/** Flattens server-authorized chunks into chronologically ordered lines. */
export function toTranscriptLines(chunks: MeetAiChunk[]): TranscriptLine[] {
  return chunks
    .flatMap((chunk) => {
      const segments = chunk.segments?.length
        ? chunk.segments
        : [
            {
              speaker: chunk.speaker ?? null,
              kind: chunk.speaker?.kind ?? null,
              startSeconds: chunk.start_seconds,
              transcript: chunk.transcript ?? '',
            },
          ];
      return [...segments]
        .sort((a, b) => a.startSeconds - b.startSeconds)
        .map((segment, index) => ({
          id: `${chunk.id}:${index}`,
          speaker: segment.speaker?.displayName ?? null,
          kind: segment.kind ?? null,
          startSeconds: segment.startSeconds,
          text: segment.transcript?.trim() ?? '',
          status: chunk.status,
          sequence: chunk.sequence,
        }));
    })
    .sort((a, b) => a.startSeconds - b.startSeconds || a.sequence - b.sequence)
    .map(({ sequence: _sequence, ...line }) => line);
}

export function formatTimestamp(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = String(safe % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** Case- and diacritic-insensitive text for Vietnamese and English search. */
export function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterTranscriptLines(lines: TranscriptLine[], query: string) {
  const needle = normalizeText(query);
  if (!needle) return lines;
  return lines.filter((line) =>
    normalizeText(`${line.speaker ?? ''} ${line.text}`).includes(needle)
  );
}

/**
 * Finds the transcript line an evidence quote came from: an exact substring
 * match first, then the line sharing most of the quote's words.
 */
export function findQuoteLine(lines: TranscriptLine[], quote: string) {
  const needle = normalizeText(quote);
  if (!needle) return null;
  const exact = lines.find((line) => normalizeText(line.text).includes(needle));
  if (exact) return exact;
  const words = new Set(needle.split(' ').filter((word) => word.length > 1));
  if (words.size < 3) return null;
  let best: { line: TranscriptLine; score: number } | null = null;
  for (const line of lines) {
    const lineWords = new Set(normalizeText(line.text).split(' '));
    let hits = 0;
    for (const word of words) if (lineWords.has(word)) hits++;
    const score = hits / words.size;
    if (!best || score > best.score) best = { line, score };
  }
  return best && best.score >= 0.6 ? best.line : null;
}

export function transcriptToMarkdown(
  title: string,
  lines: TranscriptLine[],
  unknownSpeaker: string
) {
  const body = lines
    .filter((line) => line.text)
    .map(
      (line) =>
        `**[${formatTimestamp(line.startSeconds)}] ${escapeMarkdown(
          line.speaker ?? unknownSpeaker
        )}:** ${escapeMarkdown(line.text)}`
    )
    .join('\n\n');
  return `# ${escapeMarkdown(title)}\n\n${body}\n`;
}

export function transcriptToPlainText(
  lines: TranscriptLine[],
  unknownSpeaker: string
) {
  return lines
    .filter((line) => line.text)
    .map(
      (line) =>
        `[${formatTimestamp(line.startSeconds)}] ${
          line.speaker ?? unknownSpeaker
        }: ${line.text}`
    )
    .join('\n');
}

function escapeMarkdown(value: string) {
  return value.replace(/([\\`*_[\]#<>|])/g, '\\$1');
}

export function transcriptFileName(title: string) {
  const slug = normalizeText(title).replace(/\s+/g, '-').slice(0, 60);
  return `${slug || 'meeting'}-transcript.md`;
}
