import type { MeetAiChunk } from '@tuturuuu/internal-api';
import { expect, it } from 'vitest';
import { transcriptBlocks, transcriptTime } from './transcript-blocks';

const alice = { accountId: 'a', label: 'Alice', kind: 'microphone' as const };
const bob = { accountId: 'b', label: 'Bob', kind: 'microphone' as const };
const chunk = (
  id: string,
  sequence: number,
  segments: MeetAiChunk['segments'],
  status = 'completed'
): MeetAiChunk => ({
  id,
  sequence,
  start_seconds: 0,
  duration_seconds: 10,
  status,
  transcript: null,
  cost_usd: null,
  segments,
});
const say = (
  speaker: typeof alice | null,
  startSeconds: number,
  transcript: string
) => ({ speaker, kind: 'microphone' as const, startSeconds, transcript });

it('formats minutes and hours', () => {
  expect(transcriptTime(3)).toBe('0:03');
  expect(transcriptTime(125.9)).toBe('2:05');
  expect(transcriptTime(3725)).toBe('1:02:05');
  expect(transcriptTime(-4)).toBe('0:00');
});

it('groups consecutive lines by speaker in time order within each chunk', () => {
  const blocks = transcriptBlocks([
    chunk('c0', 0, [say(bob, 4, 'Agreed'), say(alice, 1, 'Hi all')]),
    chunk('c1', 1, [say(bob, 12, 'Next item'), say(null, 15, 'Clip')]),
  ]);
  expect(
    blocks.map((block) => [block.label, block.lines.map((l) => l.text)])
  ).toEqual([
    ['Alice', ['Hi all']],
    ['Bob', ['Agreed', 'Next item']],
    [null, ['Clip']],
  ]);
});

it('keeps chunk order across sessions that restart at zero', () => {
  const blocks = transcriptBlocks([
    chunk('late', 0, [say(alice, 600, 'End of first session')]),
    chunk('restart', 0, [say(bob, 0, 'Second session')]),
  ]);
  expect(blocks.map((block) => block.label)).toEqual(['Alice', 'Bob']);
});

it('never renders erased segments and marks pending text', () => {
  const blocks = transcriptBlocks([
    chunk('c0', 0, [{ erased: true }, say(alice, 2, '  ')], 'processing'),
  ]);
  expect(blocks).toHaveLength(1);
  expect(blocks[0]?.lines).toEqual([
    { key: 'c0:1', startSeconds: 2, text: null, status: 'processing' },
  ]);
});
