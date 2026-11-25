import { describe, expect, it } from 'vitest';
import { isOutsideWorkspace, whiteboardPolicy } from './whiteboard-policy';

const base = {
  merged: true,
  guestWhiteboard: false,
  requiresAccount: false,
  guestsPresent: false,
};

describe('whiteboardPolicy', () => {
  it('changes nothing without Meet UX v2', () => {
    for (const guestWhiteboard of [true, false])
      for (const requiresAccount of [true, false])
        expect(
          whiteboardPolicy({
            ...base,
            merged: false,
            guestWhiteboard,
            requiresAccount,
            guestsPresent: true,
          })
        ).toEqual({
          offerBoard: true,
          guestBoard: false,
          penBoardFirst: false,
        });
  });

  it('keeps guests on the pen board while the switch is off', () => {
    expect(whiteboardPolicy({ ...base, requiresAccount: true })).toEqual({
      offerBoard: false,
      guestBoard: false,
      penBoardFirst: false,
    });
  });

  it('opens the pen board for everyone in a room with a guest while off', () => {
    expect(whiteboardPolicy({ ...base, guestsPresent: true })).toEqual({
      offerBoard: true,
      guestBoard: false,
      penBoardFirst: true,
    });
    expect(whiteboardPolicy(base).penBoardFirst).toBe(false);
  });

  it('gives guests the Tuturuuu Whiteboard while the switch is on', () => {
    const on = { ...base, guestWhiteboard: true, guestsPresent: true };
    expect(whiteboardPolicy({ ...on, requiresAccount: true })).toEqual({
      offerBoard: true,
      guestBoard: true,
      penBoardFirst: false,
    });
    expect(whiteboardPolicy(on).penBoardFirst).toBe(false);
  });
});

describe('isOutsideWorkspace', () => {
  it('counts anonymous guests and signed-in non-members', () => {
    expect(isOutsideWorkspace({ guest: true })).toBe(true);
    expect(isOutsideWorkspace({ external: true })).toBe(true);
    expect(isOutsideWorkspace({})).toBe(false);
  });
});
