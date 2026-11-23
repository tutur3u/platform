import type { MeetAiSession, MeetAiState } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import { meetingAiStatus, notesRetryable } from './meeting-ai-status';

const now = Date.parse('2026-11-23T10:00:00Z');
const session = (over: Partial<MeetAiSession> = {}): MeetAiSession => ({
  id: 's1',
  user_id: 'host',
  created_at: '2026-11-23T09:00:00Z',
  ended_at: null,
  notes_started_at: null,
  notes_status: 'pending',
  notes: null,
  notes_cost_usd: null,
  ...over,
});
const state = (
  sessions: MeetAiSession[],
  over: Partial<MeetAiState> = {}
): MeetAiState => ({
  available: true,
  configured: true,
  canManage: true,
  sessions,
  chunks: [],
  model: 'm',
  transcriptionCostUsd: null,
  notesCostUsd: null,
  estimatedCostUsd: null,
  unpricedRequests: null,
  inputTokens: null,
  outputTokens: null,
  ...over,
});
const base = {
  isLoading: false,
  error: null,
  phase: null,
  capturing: false,
  creditFailure: null,
  now,
};
const fence = (ready: boolean, pending = 0, declined = 0) => ({
  available: true as const,
  version: 'v',
  choice: 'allow' as const,
  fence: { ready, pending, declined, admitted: 3 },
  active: true,
  activeSince: 1,
});

describe('meeting AI status', () => {
  it('loads, then reports a failed load', () => {
    expect(meetingAiStatus({ ...base, data: undefined }).kind).toBe('loading');
    expect(
      meetingAiStatus({ ...base, data: undefined, error: new Error('x') })
    ).toEqual({ kind: 'blocked', block: { kind: 'load_failed' } });
  });

  it('explains why it is off', () => {
    expect(
      meetingAiStatus({
        ...base,
        data: state([], { available: false, unavailableReason: 'audience' }),
      })
    ).toEqual({
      kind: 'blocked',
      block: { kind: 'off', reason: 'audience' },
    });
    expect(
      meetingAiStatus({ ...base, data: state([], { available: false }) })
    ).toMatchObject({ block: { reason: 'disabled' } });
    expect(
      meetingAiStatus({ ...base, data: state([], { configured: false }) })
    ).toEqual({ kind: 'blocked', block: { kind: 'not_configured' } });
  });

  it('walks idle, starting, live, paused and processing', () => {
    expect(meetingAiStatus({ ...base, data: state([]) }).kind).toBe('idle');
    expect(
      meetingAiStatus({ ...base, data: state([]), phase: 'starting' }).kind
    ).toBe('starting');
    const open = state([session()]);
    expect(meetingAiStatus({ ...base, data: open, capturing: true }).kind).toBe(
      'live'
    );
    expect(
      meetingAiStatus({
        ...base,
        data: open,
        capturing: true,
        consent: fence(false, 2, 1),
      })
    ).toMatchObject({ kind: 'paused', pending: 2, declined: 1 });
    expect(
      meetingAiStatus({
        ...base,
        data: open,
        capturing: true,
        consent: fence(true),
      }).kind
    ).toBe('live');
    expect(meetingAiStatus({ ...base, data: open }).kind).toBe('detached');
    expect(
      meetingAiStatus({ ...base, data: open, phase: 'finishing' }).kind
    ).toBe('processing');
  });

  it('stops on a billing refusal', () => {
    expect(
      meetingAiStatus({
        ...base,
        data: state([session()]),
        capturing: false,
        creditFailure: 'credits_exhausted',
      })
    ).toMatchObject({ kind: 'failed', retryable: false });
  });

  it('reports ready notes and offers retry only once it can help', () => {
    const ended = '2026-11-23T09:59:00Z';
    expect(
      meetingAiStatus({
        ...base,
        data: state([session({ ended_at: ended, notes_status: 'completed' })]),
      }).kind
    ).toBe('ready');
    // Just ended: notes are still on their way.
    expect(
      meetingAiStatus({
        ...base,
        data: state([session({ ended_at: ended })]),
      }).kind
    ).toBe('processing');
    expect(
      meetingAiStatus({
        ...base,
        data: state([
          session({ ended_at: '2026-11-23T09:30:00Z', notes_status: 'failed' }),
        ]),
      })
    ).toMatchObject({ kind: 'failed', retryable: true });
    const stuck = session({
      ended_at: ended,
      notes_status: 'processing',
      notes_started_at: '2026-11-23T09:59:30Z',
    });
    expect(notesRetryable(stuck, now)).toBe(false);
    expect(meetingAiStatus({ ...base, data: state([stuck]) }).kind).toBe(
      'processing'
    );
    expect(notesRetryable(stuck, now + 120_000)).toBe(true);
  });
});
