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
const deck = [
  { id: FIRST, front: 'Stable sort', back: 'Keeps equal keys in order' },
  { id: SECOND, front: 'In place', back: 'Uses constant extra space' },
];
// What the room receives: fronts, plus the back of a card the host flipped.
const fronts = deck.map(({ id, front }) => ({ id, front }));

afterEach(() => {
  cleanup();
  closeRoom();
});

it('lets the host save a deck, see both sides and reveal the card to the room', () => {
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
    snapshot: { flashcards: { cards: fronts, index: 0, flipped: false } },
    host: {
      flashcards: {
        cards: deck,
        progress: [{ participantId: ANA, known: 1 }],
      },
    },
  });
  // The host reads both sides while the room still has only the front.
  expect(screen.getByText('Stable sort')).toBeTruthy();
  // The card is text, read out when it changes; the action is its own button.
  expect(
    screen.getByText('Stable sort').closest('[aria-live="polite"]')
  ).not.toBeNull();
  expect(screen.queryByRole('button', { name: /Stable sort/ })).toBeNull();
  expect(screen.getByRole('button', { name: t.reveal })).toBeTruthy();
  expect(screen.getByText('Keeps equal keys in order')).toBeTruthy();
  expect(screen.getByText(t.room_sees_front)).toBeTruthy();
  expect(screen.getByText('Ana')).toBeTruthy();
  expect(screen.getByText('1 of 2')).toBeTruthy();
  expect(screen.getByRole('button', { name: t.previous })).toHaveProperty(
    'disabled',
    true
  );
  fireEvent.click(screen.getByRole('button', { name: t.reveal }));
  expect(sent().at(-1)).toEqual({
    kind: 'flashcards.show',
    index: 0,
    flipped: true,
  });

  room({
    manager: true,
    snapshot: {
      flashcards: { cards: [deck[0]!, fronts[1]!], index: 0, flipped: true },
    },
    host: { flashcards: { cards: deck, progress: [] } },
  });
  expect(screen.getByText(t.room_sees_back)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.hide }));
  fireEvent.click(screen.getByRole('button', { name: t.next }));
  expect(sent().slice(-2)).toEqual([
    { kind: 'flashcards.show', index: 0, flipped: false },
    { kind: 'flashcards.show', index: 1, flipped: false },
  ]);
  // Editing starts from the full deck the host holds, backs included.
  fireEvent.click(screen.getByRole('button', { name: t.edit_deck }));
  expect(
    (screen.getByLabelText('Back of card 2') as HTMLInputElement).value
  ).toBe('Uses constant extra space');
});

it('shows a participant the back only once the host reveals it', () => {
  renderPanel(FlashcardsPanel, false);
  expect(screen.getByText(t.empty_participant)).toBeTruthy();
  room({
    snapshot: { flashcards: { cards: fronts, index: 0, flipped: false } },
  });
  expect(screen.getByText('Stable sort')).toBeTruthy();
  // No private peek: nothing on the card flips it, and nothing reveals it.
  expect(screen.queryByText('Keeps equal keys in order')).toBeNull();
  expect(screen.queryByRole('button', { name: t.reveal })).toBeNull();
  expect(screen.queryByText(t.room_sees_front)).toBeNull();
  expect(screen.queryByText(t.deck)).toBeNull();
  fireEvent.click(screen.getByText('Stable sort'));
  expect(screen.queryByText('Keeps equal keys in order')).toBeNull();
  expect(sent()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: t.know_it }));
  expect(sent()).toEqual([
    { kind: 'flashcards.mark', cardId: FIRST, known: true },
  ]);

  // The host reveals the card: the room's copy now carries that one back.
  room({
    snapshot: {
      flashcards: { cards: [deck[0]!, fronts[1]!], index: 0, flipped: true },
    },
    mine: { flashcards: { known: [FIRST] } },
  });
  const back = screen.getByText('Keeps equal keys in order');
  // The revealed side is announced as text, under its own label.
  expect(back.closest('[aria-live="polite"]')?.textContent).toBe(
    `${t.back}Keeps equal keys in order`
  );
  expect(screen.getByText('You know 1 of 2')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.still_learning }));
  expect(sent().at(-1)).toEqual({
    kind: 'flashcards.mark',
    cardId: FIRST,
    known: false,
  });

  // The host moves on: the next card shows its front and no back at all.
  room({
    snapshot: { flashcards: { cards: fronts, index: 1, flipped: false } },
    mine: { flashcards: { known: [FIRST] } },
  });
  expect(screen.getByText('In place')).toBeTruthy();
  expect(screen.queryByText('Uses constant extra space')).toBeNull();
  expect(screen.queryByText('Keeps equal keys in order')).toBeNull();
});
