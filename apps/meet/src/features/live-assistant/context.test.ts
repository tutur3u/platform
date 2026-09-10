import { expect, it } from 'vitest';
import {
  applyLiveCheckpoint,
  buildLiveInstructions,
  EMPTY_LIVE_JOURNAL,
  serializeLiveContext,
} from './context';

const input = {
  now: '2026-09-09T16:00:00Z',
  timezone: 'Asia/Ho_Chi_Minh',
  memoryEnabled: true,
  memories: [
    {
      id: 'f83c73f6-f4fc-44c7-87f1-f3ce722d8c42',
      content: 'Private project Blue Finch',
      category: 'project' as const,
      created_at: '2026-09-09',
    },
  ],
  sharedContext: 'Public meeting agenda',
  journal: EMPTY_LIVE_JOURNAL,
};
it('never sends private memories to a room assistant, even when enabled', () => {
  const prompt = buildLiveInstructions({ ...input, mode: 'room' });
  expect(prompt).toContain('Public meeting agenda');
  expect(prompt).not.toContain('Blue Finch');
});
it('requires explicit opt-in before adding memory to personal context', () => {
  expect(
    buildLiveInstructions({ ...input, mode: 'personal', memoryEnabled: false })
  ).not.toContain('Blue Finch');
  expect(buildLiveInstructions({ ...input, mode: 'personal' })).toContain(
    'Blue Finch'
  );
});

it('retains later turns that share a checkpoint timestamp', () => {
  const turns = [1, 2, 3].map((sequence) => ({
    role: 'user' as const,
    text: String(sequence),
    at: 'same-time',
    sequence,
  }));
  const journal = applyLiveCheckpoint(
    { turns, checkpoints: [] },
    { summary: 'first two', decisions: [], openQuestions: [], through: '2' },
    2
  );
  expect(journal.turns.map((turn) => turn.sequence)).toEqual([3]);
});

it('bounds serialized context even when escaping expands its character count', () => {
  const result = serializeLiveContext(['\0'.repeat(1000), 'recent'], 100);
  expect(result.length).toBeLessThanOrEqual(100);
  expect(JSON.parse(result)).toEqual(['recent']);
});
