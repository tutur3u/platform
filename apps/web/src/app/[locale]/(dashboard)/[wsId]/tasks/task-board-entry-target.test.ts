import { describe, expect, it } from 'vitest';
import { resolveTaskBoardEntryTarget } from './task-board-entry-target';

const boards = [
  { id: 'board-first' },
  { id: 'board-default' },
  { id: 'board-third' },
];

describe('resolveTaskBoardEntryTarget', () => {
  it('uses the configured default board when it is active and accessible', () => {
    expect(
      resolveTaskBoardEntryTarget({
        accessType: 'member',
        boards,
        defaultBoardId: 'board-default',
      })
    ).toEqual({ boardId: 'board-default', type: 'redirect' });
  });

  it('falls back to the first active board when the default is unavailable', () => {
    expect(
      resolveTaskBoardEntryTarget({
        accessType: 'member',
        boards,
        defaultBoardId: 'missing-board',
      })
    ).toEqual({ boardId: 'board-first', type: 'redirect' });
  });

  it('uses the first accessible guest board for guest access', () => {
    expect(
      resolveTaskBoardEntryTarget({
        accessType: 'guest',
        boards,
        defaultBoardId: null,
      })
    ).toEqual({ boardId: 'board-first', type: 'redirect' });
  });

  it('renders creation for members with no active boards', () => {
    expect(
      resolveTaskBoardEntryTarget({
        accessType: 'member',
        boards: [],
        defaultBoardId: null,
      })
    ).toEqual({ type: 'create' });
  });

  it('does not render creation for guests with no accessible active boards', () => {
    expect(
      resolveTaskBoardEntryTarget({
        accessType: 'guest',
        boards: [],
        defaultBoardId: null,
      })
    ).toEqual({ type: 'not-found' });
  });
});
