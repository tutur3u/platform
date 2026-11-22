// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ANA,
  closeRoom,
  lastRequestId,
  reconnectRoom,
  renderPanel,
  room,
  SELF,
  sent,
  strings,
} from '../activity-test-kit';

vi.mock('../panel-frame', () => ({
  LiveActivityPanelFrame: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { GamePanel } from './game-panel';

const t = strings.game;
const ROUND = '77777777-7777-4777-8777-777777777777';
const round = {
  id: ROUND,
  index: 0,
  total: 1,
  prompt: 'Fastest average sort?',
  options: ['Bubble sort', 'Quick sort'],
  endsAt: Date.now() + 60_000,
};
const idle = { phase: 'idle' as const, answered: 0, scores: [] };
const prepared = {
  game: {
    rounds: [
      {
        id: ROUND,
        prompt: round.prompt,
        options: round.options,
        answer: 1,
        seconds: 20,
      },
    ],
  },
};

afterEach(() => {
  cleanup();
  closeRoom();
});

it('lets the host prepare rounds, start once the room has them and pace the game', () => {
  renderPanel(GamePanel, true);
  expect(screen.getByText(t.empty_host)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.add_round }));
  const save = screen.getByRole('button', { name: t.save_rounds });
  fireEvent.change(screen.getByLabelText(t.prompt), {
    target: { value: 'Fastest average sort?' },
  });
  fireEvent.change(screen.getByLabelText('Option 1'), {
    target: { value: 'Bubble sort' },
  });
  fireEvent.change(screen.getByLabelText('Option 2'), {
    target: { value: 'Quick sort' },
  });
  // A round needs its correct option before it can be saved.
  expect(save).toHaveProperty('disabled', true);
  fireEvent.click(screen.getByLabelText('Mark option 2 as correct'));
  fireEvent.click(save);
  expect(sent()).toEqual([
    {
      kind: 'game.set',
      rounds: [
        {
          prompt: 'Fastest average sort?',
          options: ['Bubble sort', 'Quick sort'],
          answer: 1,
          seconds: 20,
        },
      ],
    },
  ]);

  room({ manager: true, snapshot: { game: idle }, host: prepared });
  fireEvent.click(screen.getByRole('button', { name: t.start }));
  room({
    manager: true,
    snapshot: { game: { phase: 'question', round, answered: 1, scores: [] } },
    host: prepared,
  });
  // The host paces the round and does not answer it.
  expect(screen.getByText('1 person answered')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Quick sort' })).toHaveProperty(
    'disabled',
    true
  );
  fireEvent.click(screen.getByRole('button', { name: t.reveal }));
  room({
    manager: true,
    snapshot: {
      game: {
        phase: 'reveal',
        round: { ...round, correct: 1 },
        answered: 1,
        scores: [{ participantId: ANA, score: 100 }],
      },
    },
    host: prepared,
  });
  expect(screen.getByText('Ana')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.finish }));
  expect(sent().slice(1)).toEqual([
    { kind: 'game.start' },
    { kind: 'game.reveal' },
    { kind: 'game.next' },
  ]);
});

it('says when a late save is refused and offers no round editor while a game runs', () => {
  renderPanel(GamePanel, true);
  const store = room({
    manager: true,
    snapshot: { game: idle },
    host: prepared,
  });
  fireEvent.change(screen.getByLabelText(t.prompt), {
    target: { value: 'Slowest average sort?' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.save_rounds }));
  // Another host started the game before this save arrived: the room keeps it.
  act(() =>
    store.receive({
      type: 'error',
      error: 'activity_game_running',
      requestId: lastRequestId(),
    })
  );
  expect(screen.getByRole('status').textContent).toBe(
    strings.errors.game_running
  );
  room({
    manager: true,
    snapshot: { game: { phase: 'question', round, answered: 0, scores: [] } },
  });
  expect(screen.queryByRole('button', { name: t.save_rounds })).toBeNull();
  expect(screen.queryByLabelText(t.prompt)).toBeNull();
});

it('lets a player answer once and shows the key and scores on reveal', () => {
  renderPanel(GamePanel, false);
  expect(screen.getByText(t.empty_participant)).toBeTruthy();
  room({
    snapshot: { game: { phase: 'question', round, answered: 0, scores: [] } },
  });
  expect(screen.getByText(t.pick_one)).toBeTruthy();
  expect(screen.queryByRole('button', { name: t.reveal })).toBeNull();
  // Arrow keys move between the options without locking an answer in.
  const bubble = screen.getByRole('radio', { name: 'Bubble sort' });
  bubble.focus();
  fireEvent.keyDown(bubble, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(
    screen.getByRole('radio', { name: 'Quick sort' })
  );
  expect(sent()).toEqual([]);
  fireEvent.click(screen.getByRole('radio', { name: 'Quick sort' }));
  expect(sent()).toEqual([{ kind: 'game.answer', roundId: ROUND, choice: 1 }]);

  room({
    snapshot: { game: { phase: 'question', round, answered: 1, scores: [] } },
    mine: { game: { roundId: ROUND, choice: 1 } },
  });
  expect(screen.getByText(t.locked_in)).toBeTruthy();
  // The first answer counts: the options no longer take input.
  expect(screen.getByRole('radio', { name: 'Bubble sort' })).toHaveProperty(
    'disabled',
    true
  );

  room({
    snapshot: {
      game: {
        phase: 'reveal',
        round: { ...round, correct: 1 },
        answered: 1,
        scores: [{ participantId: SELF, score: 100 }],
      },
    },
    mine: { game: { roundId: ROUND, choice: 1 } },
  });
  expect(screen.getByText(t.right)).toBeTruthy();
  // The key is said in words, so it does not depend on seeing a colour.
  expect(
    screen.getByRole('radio', {
      name: new RegExp(`Quick sort\\s*${strings.options.correct_choice}`),
    })
  ).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Bubble sort' })).toBeTruthy();
  expect(screen.getByText(t.scoreboard)).toBeTruthy();
  expect(screen.getByText(strings.you)).toBeTruthy();
});

it('does not take answers after the deadline', () => {
  renderPanel(GamePanel, false);
  room({
    snapshot: {
      game: {
        phase: 'question',
        round: { ...round, endsAt: Date.now() - 1_000 },
        answered: 0,
        scores: [],
      },
    },
  });
  expect(screen.getByText(t.time_up)).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Quick sort' })).toHaveProperty(
    'disabled',
    true
  );
});

it('keeps a round the host is writing through a reconnect', () => {
  renderPanel(GamePanel, true);
  room({ manager: true, snapshot: { game: idle }, host: prepared });
  fireEvent.click(screen.getByRole('button', { name: t.add_round }));
  fireEvent.change(screen.getAllByLabelText(t.prompt)[1]!, {
    target: { value: 'Half written' },
  });
  reconnectRoom();
  // The room repeats the saved rounds; the one in progress is still there.
  room({ manager: true, snapshot: { game: idle }, host: prepared });
  expect(
    (screen.getAllByLabelText(t.prompt) as HTMLInputElement[]).map(
      ({ value }) => value
    )
  ).toEqual([round.prompt, 'Half written']);
});
