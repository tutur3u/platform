import { describe, expect, it } from 'vitest';
import {
  isOutsideWorkspace,
  soloBoardAction,
  whiteboardPolicy,
} from './whiteboard-policy';

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
          memberBoard: false,
          guestBoard: false,
          boardEntry: false,
          penBoardFirst: false,
        });
  });

  it('keeps guests on the pen board while the switch is off', () => {
    expect(whiteboardPolicy({ ...base, requiresAccount: true })).toEqual({
      offerBoard: false,
      memberBoard: false,
      guestBoard: false,
      boardEntry: false,
      penBoardFirst: false,
    });
  });

  it('opens the pen board for everyone in a room with a guest while off', () => {
    expect(whiteboardPolicy({ ...base, guestsPresent: true })).toEqual({
      offerBoard: true,
      memberBoard: true,
      guestBoard: false,
      boardEntry: true,
      penBoardFirst: true,
    });
    expect(whiteboardPolicy(base).penBoardFirst).toBe(false);
  });

  it('gives guests the Tuturuuu Whiteboard while the switch is on', () => {
    const on = { ...base, guestWhiteboard: true, guestsPresent: true };
    expect(whiteboardPolicy({ ...on, requiresAccount: true })).toEqual({
      offerBoard: true,
      memberBoard: false,
      guestBoard: true,
      boardEntry: true,
      penBoardFirst: false,
    });
    expect(whiteboardPolicy(on).penBoardFirst).toBe(false);
  });
});

describe('a members-only room', () => {
  it('gives the host and every member the same Tuturuuu Whiteboard', () => {
    // The host and a member with no room tools: both open the board.
    const host = whiteboardPolicy(base);
    const member = whiteboardPolicy(base);
    expect(host.offerBoard && member.offerBoard).toBe(true);
    expect(member.memberBoard).toBe(true);
    expect(member.penBoardFirst).toBe(false);
  });
});

describe('the guest Whiteboard entry', () => {
  const board = { active: false, toggle: () => {} };
  const guest = { ...base, requiresAccount: true, guestsPresent: true };

  it('opens the same Tuturuuu Whiteboard as the host while the switch is on', () => {
    const on = whiteboardPolicy({ ...guest, guestWhiteboard: true });
    const host = whiteboardPolicy({ ...base, guestWhiteboard: true });
    expect(on.boardEntry).toBe(true);
    expect(on.penBoardFirst).toBe(false);
    expect(host.penBoardFirst).toBe(false);
    // A guest has no room tools, so the board is listed on its own.
    expect(soloBoardAction(on, false, board)).toBe(board);
  });

  it('keeps the pen board for a guest while the switch is off', () => {
    const off = whiteboardPolicy(guest);
    expect(off.offerBoard).toBe(false);
    expect(soloBoardAction(off, false, board)).toBeUndefined();
  });

  it('lists the board in the room tools block for someone who may use them', () => {
    const member = whiteboardPolicy(base);
    expect(soloBoardAction(member, true, board)).toBeUndefined();
    expect(soloBoardAction(member, false, board)).toBe(board);
  });
});

describe('isOutsideWorkspace', () => {
  it('counts anonymous guests and signed-in non-members', () => {
    expect(isOutsideWorkspace({ guest: true })).toBe(true);
    expect(isOutsideWorkspace({ external: true })).toBe(true);
    expect(isOutsideWorkspace({})).toBe(false);
  });
});
