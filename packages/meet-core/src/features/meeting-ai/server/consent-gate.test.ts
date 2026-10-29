import { expect, it } from 'vitest';
import { consentedSourceIndexes, needsConsentRecords } from './consent-gate';

const started = '2026-10-29T10:00:00.000Z';
const at = (seconds: number) =>
  new Date(Date.parse(started) + seconds * 1000).toISOString();

it('keeps the uploading host and only currently allowed participants', () => {
  expect(
    consentedSourceIndexes({
      actorId: 'host',
      sessionStartedAt: started,
      records: [
        { user_id: 'a', decision: 'allow', created_at: at(0) },
        { user_id: 'b', decision: 'deny', created_at: at(0) },
        { user_id: 'c', decision: 'allow', created_at: at(0) },
        { user_id: 'c', decision: 'withdraw', created_at: at(60) },
        { user_id: 'd', decision: 'deny', created_at: at(0) },
        { user_id: 'd', decision: 'allow', created_at: at(120) },
      ],
      sources: [
        { speakerAccountId: 'host', startSeconds: 30 },
        { speakerAccountId: 'a', startSeconds: 30 },
        { speakerAccountId: 'b', startSeconds: 30 },
        // Captured before the withdrawal, uploaded after it: still excluded.
        { speakerAccountId: 'c', startSeconds: 30 },
        // Captured while declined, before the later allow.
        { speakerAccountId: 'd', startSeconds: 30 },
        { speakerAccountId: 'd', startSeconds: 150 },
        { speakerAccountId: 'unknown', startSeconds: 30 },
        { startSeconds: 30 },
      ],
    })
  ).toEqual([0, 1, 5]);
});

it('treats a missing consent log as no consent', () => {
  expect(
    consentedSourceIndexes({
      actorId: 'host',
      sessionStartedAt: started,
      records: null,
      sources: [
        { speakerAccountId: 'a', startSeconds: 0 },
        { speakerAccountId: 'host', startSeconds: 0 },
      ],
    })
  ).toEqual([1]);
});

it('needs records only when a source is not the uploading host', () => {
  expect(needsConsentRecords('host', [{ speakerAccountId: 'host' }])).toBe(
    false
  );
  expect(needsConsentRecords('host', [{}])).toBe(true);
});
