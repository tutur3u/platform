import { describe, expect, it } from 'vitest';
import {
  appendLiveTranscript,
  finishLiveTranscript,
} from './live-session-journal';

describe('live transcript', () => {
  it('joins deltas within a turn without merging different speakers or completed turns', () => {
    let entries = appendLiveTranscript([], 'user', 'Plan ', '1');
    entries = appendLiveTranscript(entries, 'user', 'today', '2');
    entries = appendLiveTranscript(
      entries,
      'assistant',
      'Start with reviews.',
      '3'
    );
    expect(entries.map((entry) => entry.text)).toEqual([
      'Plan today',
      'Start with reviews.',
    ]);
    entries = finishLiveTranscript(entries);
    entries = appendLiveTranscript(entries, 'assistant', 'Then planning.', '4');
    expect(entries).toHaveLength(3);
  });
  it('marks an interrupted answer, retains it, and bounds memory', () => {
    const entries = finishLiveTranscript(
      appendLiveTranscript([], 'assistant', 'Hello', '1'),
      true
    );
    expect(entries[0]).toMatchObject({ complete: true, interrupted: true });
    let bounded = entries;
    for (let i = 0; i < 250; i++)
      bounded = appendLiveTranscript(
        finishLiveTranscript(bounded),
        'user',
        'test',
        String(i)
      );
    expect(bounded).toHaveLength(200);
  });
});
