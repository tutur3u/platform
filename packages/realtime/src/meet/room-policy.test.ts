import { expect, test } from 'vitest';
import { parseMeetRoomSettingsPatch } from './room-options';

test('post-call-only changes preserve an existing live-sharing policy', () => {
  const result = parseMeetRoomSettingsPatch(
    { shareNotesAfterMeeting: true },
    { shareNotes: true }
  );
  expect(result.success && result.data).toEqual({
    shareNotes: true,
    shareNotesAfterMeeting: true,
  });
});

test('independent changes preserve revocations in either arrival order', () => {
  for (const patches of [
    [{ shareNotes: false }, { shareNotesAfterMeeting: true }],
    [{ shareNotesAfterMeeting: true }, { shareNotes: false }],
  ]) {
    let current = { shareNotes: true, shareNotesAfterMeeting: false };
    for (const patch of patches) {
      const result = parseMeetRoomSettingsPatch(patch, current);
      if (!result.success) throw result.error;
      current = { shareNotesAfterMeeting: false, ...result.data };
    }
    expect(current).toEqual({
      shareNotes: false,
      shareNotesAfterMeeting: true,
    });
  }
  expect(parseMeetRoomSettingsPatch({ shareNotes: 'true' }).success).toBe(
    false
  );
});
