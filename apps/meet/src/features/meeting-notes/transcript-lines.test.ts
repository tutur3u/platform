import type { MeetAiChunk } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  filterTranscriptLines,
  findQuoteLine,
  formatTimestamp,
  toTranscriptLines,
  transcriptFileName,
  transcriptToMarkdown,
  transcriptToPlainText,
} from './transcript-lines';

const speaker = (displayName: string) => ({
  accountId: displayName,
  displayName,
  kind: 'microphone' as const,
});

const chunks: MeetAiChunk[] = [
  {
    id: 'late',
    sequence: 1,
    start_seconds: 60,
    duration_seconds: 30,
    status: 'completed',
    transcript: 'Chúng ta sẽ phát hành vào thứ Sáu',
    speaker: speaker('Lan'),
    cost_usd: null,
  },
  {
    id: 'early',
    sequence: 0,
    start_seconds: 0,
    duration_seconds: 30,
    status: 'completed',
    transcript: null,
    cost_usd: null,
    segments: [
      {
        speaker: speaker('Bob'),
        kind: 'shared_audio',
        startSeconds: 12,
        transcript: 'Let us ship the *beta* next week',
      },
      {
        speaker: speaker('Alice'),
        kind: 'microphone',
        startSeconds: 2,
        transcript: 'I will review the budget draft',
      },
    ],
  },
  {
    id: 'pending',
    sequence: 2,
    start_seconds: 90,
    duration_seconds: 30,
    status: 'processing',
    transcript: null,
    cost_usd: null,
  },
];

describe('transcript lines', () => {
  const lines = toTranscriptLines(chunks);

  it('orders batched segments and legacy chunks by start time', () => {
    expect(lines.map((line) => [line.speaker, line.startSeconds])).toEqual([
      ['Alice', 2],
      ['Bob', 12],
      ['Lan', 60],
      [null, 90],
    ]);
    expect(lines[1]?.kind).toBe('shared_audio');
    expect(lines[3]).toMatchObject({ text: '', status: 'processing' });
  });

  it('formats minute and hour timestamps', () => {
    expect(formatTimestamp(7)).toBe('0:07');
    expect(formatTimestamp(3725)).toBe('1:02:05');
  });

  it('searches speakers and words without case or Vietnamese diacritics', () => {
    expect(filterTranscriptLines(lines, 'phat hanh').map((l) => l.id)).toEqual([
      'late:0',
    ]);
    expect(filterTranscriptLines(lines, 'ALICE')).toHaveLength(1);
    expect(filterTranscriptLines(lines, '  ')).toHaveLength(4);
  });

  it('locates evidence quotes exactly or by most shared words', () => {
    expect(findQuoteLine(lines, 'ship the beta')?.id).toBe('early:1');
    expect(findQuoteLine(lines, 'Alice: review budget draft please')?.id).toBe(
      'early:0'
    );
    expect(findQuoteLine(lines, 'unrelated sentence entirely here')).toBeNull();
    expect(findQuoteLine(lines, '')).toBeNull();
  });

  it('exports escaped markdown and plain text without empty lines', () => {
    const markdown = transcriptToMarkdown('Q4 #planning', lines, 'Unknown');
    expect(markdown).toBe(
      [
        '# Q4 \\#planning',
        '',
        '**[0:02] Alice:** I will review the budget draft',
        '',
        '**[0:12] Bob:** Let us ship the \\*beta\\* next week',
        '',
        '**[1:00] Lan:** Chúng ta sẽ phát hành vào thứ Sáu',
        '',
      ].join('\n')
    );
    expect(transcriptToPlainText(lines, 'Unknown').split('\n')).toHaveLength(3);
    expect(transcriptFileName('Họp Đội Q4!')).toBe('hop-doi-q4-transcript.md');
    expect(transcriptFileName('***')).toBe('meeting-transcript.md');
  });
});
