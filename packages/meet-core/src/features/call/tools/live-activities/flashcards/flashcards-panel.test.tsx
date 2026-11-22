// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ANA,
  closeRoom,
  renderPanel,
  room,
  sent,
  strings,
} from '../activity-test-kit';

vi.mock('../panel-frame', () => ({
  LiveActivityPanelFrame: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { FlashcardsPanel } from './flashcards-panel';

const t = strings.flashcards;
const FIRST = '55555555-5555-4555-8555-555555555555';
const SECOND = '66666666-6666-4666-8666-666666666666';
const cards = [
  { id: FIRST, front: 'Stable sort', back: 'Keeps equal keys in order' },
  { id: SECOND, front: 'In place', back: 'Uses constant extra space' },
];

afterEach(() => {
  cleanup();
  closeRoom();
});

it('lets the host save a deck and drive the card everyone sees', () => {
  renderPanel(FlashcardsPanel, true);
  expect(screen.getByText(t.empty_host)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.add_card }));
  const save = screen.getByRole('button', { name: t.save_deck });
  fireEvent.change(screen.getByLabelText('Front of card 1'), {
    target: { value: ' Stable sort ' },
  });
  // Both sides are needed before the deck can be saved.
  expect(save).toHaveProperty('disabled', true);
  fireEvent.change(screen.getByLabelText('Back of card 1'), {
    target: { value: 'Keeps equal keys in order' },
  });
  fireEvent.click(save);
  expect(sent()).toEqual([
    {
      kind: 'flashcards.set',
      cards: [{ front: 'Stable sort', back: 'Keeps equal keys in order' }],
    },
  ]);

  room({
    manager: true,
    snapshot: { flashcards: { cards, index: 0, flipped: false } },
    host: { flashcards: { progress: [{ participantId: ANA, known: 1 }] } },
  });
  expect(screen.getByText('Stable sort')).toBeTruthy();
  expect(screen.getByText('Ana')).toBeTruthy();
  expect(screen.getByText('1 of 2')).toBeTruthy();
  expect(screen.getByRole('button', { name: t.previous })).toHaveProperty(
    'disabled',
    true
  );
  fireEvent.click(screen.getByRole('button', { name: t.flip_for_room }));
  fireEvent.click(screen.getByRole('button', { name: t.next }));
  expect(sent().slice(1)).toEqual([
    { kind: 'flashcards.show', index: 0, flipped: true },
    { kind: 'flashcards.show', index: 1, flipped: false },
  ]);
});

it('shows a participant the room card, a private peek and their own progress', () => {
  renderPanel(FlashcardsPanel, false);
  expect(screen.getByText(t.empty_participant)).toBeTruthy();
  room({ snapshot: { flashcards: { cards, index: 0, flipped: false } } });
  expect(screen.getByText('Stable sort')).toBeTruthy();
  expect(screen.queryByRole('button', { name: t.flip_for_room })).toBeNull();
  expect(screen.queryByText(t.deck)).toBeNull();
  // Peeking flips the card for this person only: nothing is sent.
  fireEvent.click(screen.getByRole('button', { name: t.show_back }));
  expect(screen.getByText('Keeps equal keys in order')).toBeTruthy();
  expect(sent()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: t.know_it }));
  expect(sent()).toEqual([
    { kind: 'flashcards.mark', cardId: FIRST, known: true },
  ]);

  // The host flips for the room: the peek resets and the back shows.
  room({
    snapshot: { flashcards: { cards, index: 0, flipped: true } },
    mine: { flashcards: { known: [FIRST] } },
  });
  expect(screen.getByText('Keeps equal keys in order')).toBeTruthy();
  expect(screen.getByText('You know 1 of 2')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.still_learning }));
  expect(sent().at(-1)).toEqual({
    kind: 'flashcards.mark',
    cardId: FIRST,
    known: false,
  });
});
