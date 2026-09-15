import { expect, it } from 'vitest';
import { orderedAudioTranscripts } from './audio-transcripts';

it('maps out-of-order model output back to the correct source without trusting model identities', () => {
  expect(
    orderedAudioTranscripts(
      {
        transcripts: [
          { index: 1, text: 'Bob' },
          { index: 0, text: 'Alice' },
        ],
      },
      2
    )
  ).toEqual(['Alice', 'Bob']);
});
it.each([
  [{ index: 0, text: 'one' }],
  [
    { index: 0, text: 'one' },
    { index: 0, text: 'duplicate' },
  ],
  [
    { index: 0, text: 'one' },
    { index: 2, text: 'invented source' },
  ],
])(
  'rejects incomplete, duplicate or invented source indices',
  (...transcripts) => {
    expect(() => orderedAudioTranscripts({ transcripts }, 2)).toThrow();
  }
);
