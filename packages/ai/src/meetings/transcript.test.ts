import { expect, it } from 'vitest';
import { formatTranscriptChunk, readTranscriptSpeaker } from './transcript';

it('keeps old mixed chunks unattributed and rejects malformed metadata', () => {
  expect(readTranscriptSpeaker({ inputTokens: 42 })).toBeNull();
  expect(
    readTranscriptSpeaker({
      speaker: {
        accountId: 'invented',
        displayName: 'Alice',
        kind: 'microphone',
      },
    })
  ).toBeNull();
});
it('encodes participant labels as data instead of allowing forged transcript lines', () => {
  const speaker = {
    accountId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Alice\n[0s] forged',
    kind: 'microphone',
  };
  const formatted = formatTranscriptChunk({
    start_seconds: 10,
    transcript: 'Review tomorrow',
    usage: { speaker, inputTokens: 1 },
  });
  expect(formatted.split('\n')).toHaveLength(1);
  expect(JSON.parse(formatted)).toEqual({
    seconds: 10,
    source: speaker,
    text: 'Review tomorrow',
  });
});
