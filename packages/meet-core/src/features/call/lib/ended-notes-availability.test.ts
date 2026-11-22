import { describe, expect, it } from 'vitest';
import { endedNotesAvailability } from './ended-meeting-facts';

const notes = { summary: 'Reviewed merge sort' };
const chunk = (
  status: string,
  transcript: string | null = 'Hello room',
  extra: Record<string, unknown> = {}
) => ({ status, transcript, ...extra });

describe('endedNotesAvailability', () => {
  it('holds the reader while the state has not arrived', () => {
    expect(endedNotesAvailability({ data: undefined })).toBe('loading');
  });

  it('offers no reader when the read failed or was refused', () => {
    expect(
      endedNotesAvailability({ data: undefined, error: new Error('503') })
    ).toBe('none');
  });

  it('offers no reader when neither notes nor a readable transcript exist', () => {
    expect(
      endedNotesAvailability({
        data: {
          sessions: [{ notes: null }],
          chunks: [
            chunk('processing'),
            chunk('failed'),
            chunk('completed', '   '),
            chunk('completed', 'gone', { erased: true }),
          ],
        },
      })
    ).toBe('none');
  });

  it('treats a workspace with Meet AI turned off like any other empty room', () => {
    expect(
      endedNotesAvailability({
        data: { available: false, sessions: [], chunks: [] } as never,
      })
    ).toBe('none');
  });

  it('offers notes when only post-call notes exist', () => {
    expect(
      endedNotesAvailability({
        data: { sessions: [{ notes: null }, { notes }], chunks: [] },
      })
    ).toBe('notes');
  });

  it('offers the transcript when only completed speech exists', () => {
    expect(
      endedNotesAvailability({
        data: {
          sessions: [{ notes: null }],
          chunks: [
            chunk('completed', null, {
              segments: [{ erased: true }, { transcript: 'We start now' }],
            }),
          ],
        },
      })
    ).toBe('transcript');
  });

  it('ignores chunks whose every segment was erased', () => {
    expect(
      endedNotesAvailability({
        data: {
          sessions: [],
          chunks: [chunk('completed', 'raw', { segments: [{ erased: true }] })],
        },
      })
    ).toBe('none');
  });

  it('offers both when notes and a transcript exist', () => {
    expect(
      endedNotesAvailability({
        data: { sessions: [{ notes }], chunks: [chunk('completed')] },
      })
    ).toBe('both');
  });
});
