import { describe, expect, it } from 'vitest';
import { MEET_CONSENT_NOTICE_VERSION } from '../consent/notice';
import {
  consentedSourceIndexes,
  hasExtraHostTracks,
  hasHostSharedAudio,
  needsConsentRecords,
} from './consent-gate';
import type { MeetConsentRecord } from './consent-records';

const started = '2026-10-29T10:00:00.000Z';
const at = (seconds: number) =>
  new Date(Date.parse(started) + seconds * 1000).toISOString();
const clip = (
  speakerAccountId: string | undefined,
  startSeconds: number,
  durationSeconds = 10,
  sourceKind: 'microphone' | 'shared_audio' = 'microphone'
) => ({ speakerAccountId, startSeconds, durationSeconds, sourceKind });
const gate = (
  records: MeetConsentRecord[] | null,
  sources: ReturnType<typeof clip>[],
  excludeHostSharedAudio = false
) =>
  consentedSourceIndexes({
    actorId: 'host',
    sessionStartedAt: started,
    // Fixtures default to the notice in force; stale versions are explicit.
    records:
      records?.map((record) => ({
        notice_version: MEET_CONSENT_NOTICE_VERSION,
        ...record,
      })) ?? null,
    sources,
    excludeHostSharedAudio,
  });

describe('consent gate', () => {
  it('keeps the uploading host and only currently allowed participants', () => {
    expect(
      gate(
        [
          { user_id: 'a', decision: 'allow', created_at: at(0) },
          { user_id: 'b', decision: 'deny', created_at: at(0) },
          { user_id: 'c', decision: 'allow', created_at: at(0) },
          { user_id: 'c', decision: 'withdraw', created_at: at(60) },
          { user_id: 'd', decision: 'deny', created_at: at(0) },
          { user_id: 'd', decision: 'allow', created_at: at(120) },
        ],
        [
          clip('host', 30),
          clip('a', 30),
          clip('b', 30),
          // Captured before the withdrawal, uploaded after it: still excluded.
          clip('c', 30),
          // Captured while declined, before the later allow.
          clip('d', 30),
          clip('d', 150),
          clip('unknown', 30),
          clip(undefined, 30),
        ]
      )
    ).toEqual([0, 1, 5]);
  });

  it('accepts a clip only if it starts at or after the allow (F3)', () => {
    const records: MeetConsentRecord[] = [
      { user_id: 'a', decision: 'allow', created_at: at(30) },
    ];
    expect(gate(records, [clip('a', 29.999)])).toEqual([]);
    expect(gate(records, [clip('a', 30)])).toEqual([0]);
    expect(gate(records, [clip('a', 45)])).toEqual([0]);
  });

  it('rejects clips that overlap or end just before a withdrawal, even after a re-allow', () => {
    const records: MeetConsentRecord[] = [
      { user_id: 'a', decision: 'allow', created_at: at(0) },
      { user_id: 'a', decision: 'withdraw', created_at: at(60) },
      { user_id: 'a', decision: 'allow', created_at: at(120) },
    ];
    // Spans the withdrawal.
    expect(gate(records, [clip('a', 55, 10)])).toEqual([]);
    // Ends 5 s before it: inside the exclusion margin.
    expect(gate(records, [clip('a', 45, 10)])).toEqual([]);
    // Well before it, and after the re-allow.
    expect(gate(records, [clip('a', 20, 10), clip('a', 130)])).toEqual([0, 1]);
    // Between the withdrawal and the re-allow.
    expect(gate(records, [clip('a', 90)])).toEqual([]);
  });

  it('treats a tie containing a non-allow as not allowed (F5)', () => {
    expect(
      gate(
        [
          { id: '2', user_id: 'a', decision: 'allow', created_at: at(10) },
          { id: '1', user_id: 'a', decision: 'withdraw', created_at: at(10) },
        ],
        [clip('a', 30)]
      )
    ).toEqual([]);
  });

  it('drops an allow that names an older or missing notice version', () => {
    const allowed: MeetConsentRecord = {
      user_id: 'a',
      decision: 'allow',
      created_at: at(0),
    };
    expect(
      gate(
        [
          { ...allowed, user_id: 'old', notice_version: 'meet-v2-old' },
          { ...allowed, user_id: 'blank', notice_version: null },
          { ...allowed, user_id: 'current' },
        ],
        [clip('old', 30), clip('blank', 30), clip('current', 30)]
      )
    ).toEqual([2]);
    // A stale allow recorded after a current one supersedes it.
    expect(
      gate(
        [allowed, { ...allowed, created_at: at(5), notice_version: 'old' }],
        [clip('a', 30)]
      )
    ).toEqual([]);
    // A deny or withdraw stands whatever notice it names.
    expect(
      gate(
        [
          allowed,
          {
            ...allowed,
            decision: 'withdraw',
            created_at: at(5),
            notice_version: 'old',
          },
        ],
        [clip('a', 30)]
      )
    ).toEqual([]);
  });

  it('treats a missing consent log as no consent', () => {
    expect(gate(null, [clip('a', 0), clip('host', 0)])).toEqual([1]);
  });

  it('excludes host shared audio only when asked (F2)', () => {
    const sources = [
      clip('host', 0, 10, 'microphone'),
      clip('host', 0, 10, 'shared_audio'),
    ];
    expect(gate([], sources)).toEqual([0, 1]);
    expect(gate([], sources, true)).toEqual([0]);
    expect(hasHostSharedAudio('host', sources)).toBe(true);
    expect(hasHostSharedAudio('host', [sources[0]!])).toBe(false);
  });

  it('caps host-labelled audio at one microphone and one shared track (F1a)', () => {
    expect(
      hasExtraHostTracks('host', [clip('host', 0, 10), clip('host', 5, 10)])
    ).toBe(true);
    expect(
      hasExtraHostTracks('host', [
        clip('host', 0, 10, 'shared_audio'),
        clip('host', 2, 10, 'shared_audio'),
      ])
    ).toBe(true);
    // Back-to-back clips of one track, one track of each kind, other speakers.
    expect(
      hasExtraHostTracks('host', [
        clip('host', 0, 10),
        clip('host', 10, 10),
        clip('host', 0, 10, 'shared_audio'),
        clip('a', 0, 10),
        clip('b', 0, 10),
      ])
    ).toBe(false);
  });

  it('needs records only when a source is not the uploading host', () => {
    expect(needsConsentRecords('host', [{ speakerAccountId: 'host' }])).toBe(
      false
    );
    expect(needsConsentRecords('host', [{}])).toBe(true);
  });
});
