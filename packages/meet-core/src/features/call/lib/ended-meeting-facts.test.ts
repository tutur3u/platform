import { describe, expect, it } from 'vitest';
import { endedMeetingFacts } from './ended-meeting-facts';

const session = (
  created_at: string,
  ended_at: string | null,
  notes_status = 'completed'
) => ({ created_at, ended_at, notes_status });

describe('endedMeetingFacts', () => {
  it('returns unknown facts when the viewer has no readable sources', () => {
    expect(endedMeetingFacts({})).toEqual({
      minutes: null,
      speakers: null,
      recording: null,
      transcript: null,
    });
  });

  it('spans every captured session and recording', () => {
    const facts = endedMeetingFacts({
      ai: {
        sessions: [
          session('2026-11-18T10:00:00Z', '2026-11-18T10:20:00Z'),
          session('2026-11-18T10:30:00Z', '2026-11-18T10:48:00Z'),
        ],
        chunks: [],
      },
      recordings: [
        {
          startedAt: '2026-11-18T09:55:00Z',
          endedAt: '2026-11-18T10:40:00Z',
          status: 'ready',
        },
      ],
    });
    expect(facts.minutes).toBe(53);
    expect(facts.recording).toBe('saved');
  });

  it('ignores open or malformed spans', () => {
    const facts = endedMeetingFacts({
      ai: {
        sessions: [
          session('2026-11-18T10:00:00Z', null),
          session('bad', '2026-11-18T10:20:00Z'),
        ],
        chunks: [],
      },
    });
    expect(facts.minutes).toBeNull();
  });

  it('counts distinct speakers across chunks and segments, skipping erased', () => {
    const facts = endedMeetingFacts({
      ai: {
        sessions: [],
        chunks: [
          { status: 'completed', speaker: { accountId: 'a' } },
          {
            status: 'completed',
            speaker: null,
            segments: [
              { speaker: { accountId: 'a' } },
              { speaker: { selector: 'guest-1' } },
              { erased: true },
            ],
          },
        ],
      },
    });
    expect(facts.speakers).toBe(2);
    expect(facts.transcript).toBe('ready');
  });

  it('reports processing while chunks or notes are still running', () => {
    expect(
      endedMeetingFacts({
        ai: {
          sessions: [],
          chunks: [
            { status: 'completed' },
            { status: 'processing' },
          ],
        },
      }).transcript
    ).toBe('processing');
    expect(
      endedMeetingFacts({
        ai: {
          sessions: [
            session('2026-11-18T10:00:00Z', '2026-11-18T10:01:00Z', 'processing'),
          ],
          chunks: [],
        },
      }).transcript
    ).toBe('processing');
  });

  it('separates empty, failed and in-flight recordings', () => {
    expect(endedMeetingFacts({ recordings: [] }).recording).toBe('none');
    expect(
      endedMeetingFacts({
        recordings: [{ startedAt: 'x', status: 'failed' }],
      }).recording
    ).toBe('none');
    expect(
      endedMeetingFacts({
        recordings: [{ startedAt: 'x', status: 'recording' }],
      }).recording
    ).toBe('processing');
  });
});
