import { describe, expect, it } from 'vitest';
import {
  dueDateToLocal,
  manualDraft,
  matchOwner,
  parsePastedActions,
  pickOpenList,
  readReceipt,
  savable,
} from './action-items';

const members = [
  { id: 'a', displayName: 'An Nguyen' },
  { id: 'b', displayName: 'Binh' },
  { id: 'c', displayName: 'Binh' },
];

describe('parsePastedActions', () => {
  it('reads bullets, numbers and checkboxes from Mira /actions output', () => {
    expect(
      parsePastedActions(
        'Action items:\n- **Send** the slides\n2) Book the room\n* [ ] Email parents\n\n- send the slides'
      )
    ).toEqual(['Send the slides', 'Book the room', 'Email parents']);
  });

  it('caps a long paste', () => {
    const text = Array.from({ length: 80 }, (_, i) => `- item ${i}`).join('\n');
    expect(parsePastedActions(text)).toHaveLength(50);
  });
});

describe('matchOwner', () => {
  it('assigns on an id or a unique name only', () => {
    expect(matchOwner({ owner: null, ownerId: 'a' }, members)).toBe('a');
    expect(matchOwner({ owner: 'an nguyen' }, members)).toBe('a');
    expect(matchOwner({ owner: 'Binh' }, members)).toBeNull();
    expect(matchOwner({ owner: 'Someone' }, members)).toBeNull();
  });
});

describe('save rules', () => {
  it('ends the due day and skips closed lists', () => {
    expect(dueDateToLocal('2026-12-05')).toBe('2026-12-05T23:59');
    expect(dueDateToLocal('')).toBe('');
    expect(
      pickOpenList([
        { id: 'done', status: 'done' },
        { id: 'open', status: 'active' },
      ])
    ).toBe('open');
  });

  it('never resaves a saved or uncertain item', () => {
    const draft = manualDraft('m', 'Book the room', 'board');
    expect(savable(draft)).toBe(true);
    expect(savable({ ...draft, status: 'saved' })).toBe(false);
    expect(savable({ ...draft, status: 'uncertain' })).toBe(false);
    expect(savable({ ...draft, status: 'rejected' })).toBe(true);
    expect(savable({ ...draft, boardId: '' })).toBe(false);
  });

  it('shares receipts with the single-item review', () => {
    const storage = {
      getItem: (key: string) =>
        key === 'meet-followup:u:s:task:0'
          ? JSON.stringify({
              status: 'saved',
              url: 'https://tasks.tuturuuu.com/w',
            })
          : key === 'meet-followup:u:s:task:1'
            ? 'pending'
            : null,
    };
    expect(readReceipt(storage, 'u', 's:task:0')).toEqual({
      status: 'saved',
      url: 'https://tasks.tuturuuu.com/w',
    });
    expect(readReceipt(storage, 'u', 's:task:1')).toEqual({
      status: 'uncertain',
    });
    expect(readReceipt(storage, 'u', 's:task:2')).toEqual({ status: 'none' });
  });
});
