import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./access', () => ({
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { encodeMeetWav } from '../audio';
import { readAudioParts } from './audio-input';

const accountId = '11111111-1111-4111-8111-111111111111';
it('validates each file and keeps independent source offsets in a batch', async () => {
  const body = new FormData();
  body.set(
    'sources',
    JSON.stringify([
      {
        speakerAccountId: accountId,
        sourceKind: 'microphone',
        startSeconds: 0,
      },
      { sourceKind: 'shared_audio', startSeconds: 3 },
    ])
  );
  body.set('audio_0', encodeMeetWav(new Float32Array(16000)));
  body.set('audio_1', encodeMeetWav(new Float32Array(8000)));
  expect(await readAudioParts(body, true)).toMatchObject([
    { speakerAccountId: accountId, startSeconds: 0, durationSeconds: 1 },
    { sourceKind: 'shared_audio', startSeconds: 3, durationSeconds: 0.5 },
  ]);
  body.set('audio_1', new Blob(['invalid']));
  await expect(readAudioParts(body, true)).rejects.toMatchObject({
    status: 400,
  });
});
it('rejects attribution without source kind but accepts legacy unattributed audio', async () => {
  const body = new FormData();
  body.set('startSeconds', '0');
  body.set('audio', encodeMeetWav(new Float32Array(16000)));
  expect(await readAudioParts(body, false)).toHaveLength(1);
  body.set('speakerAccountId', accountId);
  await expect(readAudioParts(body, false)).rejects.toMatchObject({
    status: 400,
  });
  body.set('sourceKind', 'shared_audio');
  expect(await readAudioParts(body, false)).toMatchObject([
    { sourceKind: 'shared_audio', speakerAccountId: accountId },
  ]);
});
