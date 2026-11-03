import { expect, it } from 'vitest';
import {
  formatTranscriptChunk,
  meetTranscriptSegmentSchema,
  meetTranscriptSpeakerSchema,
  readTranscriptChunk,
  readTranscriptSegments,
  readTranscriptSpeaker,
  transcriptSpeakers,
} from './transcript';

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
    source: { accountId: speaker.accountId, kind: speaker.kind },
    text: 'Review tomorrow',
  });
});

it('formats every batched speaker with its own timestamp for grounded notes', async () => {
  const { transcriptSpeakers } = await import('./transcript');
  const speaker = {
    accountId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Alice',
    kind: 'microphone',
  };
  const usage = {
    segments: [
      {
        speaker,
        kind: 'microphone',
        startSeconds: 10,
        transcript: 'I will review',
      },
      {
        speaker: null,
        kind: 'shared_audio',
        startSeconds: 13,
        transcript: 'Shared clip',
      },
    ],
  };
  expect(
    formatTranscriptChunk({ start_seconds: 10, transcript: 'Combined', usage })
      .split('\n')
      .map((line) => JSON.parse(line))
  ).toEqual([
    {
      seconds: 10,
      source: { accountId: speaker.accountId, kind: speaker.kind },
      kind: 'microphone',
      text: 'I will review',
    },
    { seconds: 13, source: null, kind: 'shared_audio', text: 'Shared clip' },
  ]);
  expect(transcriptSpeakers(usage)).toEqual([speaker]);
});

const legacy = {
  accountId: '11111111-1111-4111-8111-111111111111',
  displayName: 'private@example.com',
  kind: 'microphone',
};
const selector = {
  selector: '22222222-2222-4222-8222-222222222222',
  kind: 'microphone',
};
const kept = {
  speaker: selector,
  kind: 'microphone',
  startSeconds: 12,
  transcript: 'Kept speech',
};

it('round trips exactly an erased segment and both speaker shapes', () => {
  expect(meetTranscriptSegmentSchema.parse({ erased: true })).toEqual({
    erased: true,
  });
  expect(meetTranscriptSpeakerSchema.parse(legacy)).toEqual(legacy);
  expect(meetTranscriptSpeakerSchema.parse(selector)).toEqual(selector);
  expect(
    readTranscriptSegments({ segments: [{ erased: true }, kept] })
  ).toEqual([{ erased: true }, kept]);
});
it('skips erased batched lines and speakers without resurrecting combined speech', () => {
  const usage = { speaker: legacy, segments: [{ erased: true }, kept] };
  expect(
    formatTranscriptChunk({
      start_seconds: 0,
      transcript: 'REMOVED speech',
      usage,
    })
  ).toBe(
    JSON.stringify({
      seconds: 12,
      source: selector,
      kind: 'microphone',
      text: 'Kept speech',
    })
  );
  expect(transcriptSpeakers(usage)).toEqual([selector]);
});
it.each([
  { erased: true, speaker: legacy },
  { segments: [{ erased: true }] },
  { segments: [{ erased: true }, { malformed: true }] },
  { segments: [{ ...kept, erased: true }] },
])(
  'never falls back to retained top-level text for an erased marker: %j',
  (usage) => {
    expect(
      formatTranscriptChunk({
        start_seconds: 0,
        transcript: 'REMOVED speech',
        usage,
      })
    ).toBe('');
  }
);
it('does not expose a top-level speaker for a wholly erased chunk', () => {
  expect(readTranscriptSpeaker({ erased: true, speaker: legacy })).toBeNull();
  expect(
    transcriptSpeakers({ erased: true, speaker: legacy, segments: [kept] })
  ).toEqual([]);
});
it('keeps historical unattributed speech when there is no erased marker', () => {
  expect(
    JSON.parse(
      formatTranscriptChunk({
        start_seconds: 3,
        transcript: 'Historical',
        usage: {},
      })
    )
  ).toEqual({ seconds: 3, source: null, text: 'Historical' });
});

it('projects erased chunks safely for both API consumers', () => {
  const projected = readTranscriptChunk({
    transcript: 'REMOVED speech',
    usage: { speaker: legacy, segments: [{ erased: true }, kept] },
  });
  expect(projected).toEqual({
    transcript: '',
    erased: true,
    speaker: null,
    segments: [{ erased: true }, kept],
  });
  expect(JSON.stringify(projected)).not.toContain('REMOVED speech');
  expect(JSON.stringify(projected)).not.toContain('private@example.com');
});
it('keeps malformed marked chunks empty at the API boundary', () => {
  expect(
    readTranscriptChunk({
      transcript: 'REMOVED speech',
      usage: { segments: [{ erased: true }, { malformed: true }] },
    })
  ).toEqual({ transcript: '', erased: true, speaker: null, segments: [] });
});
