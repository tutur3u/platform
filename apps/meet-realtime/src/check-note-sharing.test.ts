import { describe, expect, it } from 'vitest';
import { checkNoteSharing, notesCanaryWorkspace } from './check-note-sharing';

describe('post-deploy note sharing containment', () => {
  it('defaults to denial and verifies revocation for both settings', async () => {
    const calls: object[] = [];
    for (const field of ['shareNotes', 'shareNotesAfterMeeting'] as const) {
      expect(
        await checkNoteSharing(
          async (settings) => {
            calls.push(settings);
            return new Response(null, { status: settings[field] ? 403 : 200 });
          },
          field,
          false
        )
      ).toBe(true);
    }
    expect(calls).toEqual([
      { shareNotes: true },
      { shareNotes: false },
      { shareNotesAfterMeeting: true },
      { shareNotesAfterMeeting: false },
    ]);
  });
  it('fails if an unconfigured workspace can enable sharing', async () => {
    expect(
      await checkNoteSharing(async () => new Response(), 'shareNotes', false)
    ).toBe(false);
  });
  it('allows enable assertions only in explicit canary mode', async () => {
    expect(
      await checkNoteSharing(async () => new Response(), 'shareNotes', true)
    ).toBe(true);
    expect(notesCanaryWorkspace(undefined)).toBeUndefined();
    expect(() => notesCanaryWorkspace('real-workspace')).toThrow();
    expect(() => notesCanaryWorkspace('')).toThrow();
    expect(notesCanaryWorkspace('00000000-0000-4000-8000-0000000000cc')).toBe(
      '00000000-0000-4000-8000-0000000000cc'
    );
  });
});
