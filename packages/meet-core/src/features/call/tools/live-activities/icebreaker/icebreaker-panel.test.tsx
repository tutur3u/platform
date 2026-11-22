// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ANA,
  closeRoom,
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

import { IcebreakerPanel } from './icebreaker-panel';

const t = strings.icebreaker;
const VISIBLE = '88888888-8888-4888-8888-888888888888';
const HIDDEN = '99999999-9999-4999-8999-999999999999';
const prompt = t.suggestions.learned;

afterEach(() => {
  cleanup();
  closeRoom();
});

it('lets the host ask a suggested or custom question and moderate answers', () => {
  renderPanel(IcebreakerPanel, true);
  fireEvent.click(screen.getByRole('button', { name: prompt }));
  fireEvent.change(screen.getByLabelText(t.custom_prompt), {
    target: { value: '  What are you reading?  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.ask }));
  expect(sent()).toEqual([
    { kind: 'icebreaker.prompt', text: prompt },
    { kind: 'icebreaker.prompt', text: 'What are you reading?' },
  ]);

  room({
    manager: true,
    snapshot: {
      icebreaker: {
        prompt,
        responses: [{ id: VISIBLE, participantId: ANA, text: 'Merge sort' }],
      },
    },
    host: {
      icebreaker: {
        hidden: [{ id: HIDDEN, participantId: SELF, text: 'Off topic' }],
      },
    },
  });
  expect(screen.getByText(prompt)).toBeTruthy();
  expect(screen.getByText('Merge sort')).toBeTruthy();
  expect(screen.getByText('Off topic')).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: 'Hide the answer from Ana' })
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show the answer from You' })
  );
  fireEvent.click(screen.getByRole('button', { name: t.clear_prompt }));
  expect(sent().slice(2)).toEqual([
    { kind: 'icebreaker.hide', responseId: VISIBLE, hidden: true },
    { kind: 'icebreaker.hide', responseId: HIDDEN, hidden: false },
    { kind: 'icebreaker.prompt', text: null },
  ]);
});

it('lets a participant answer once, replace it and read the visible answers', () => {
  renderPanel(IcebreakerPanel, false);
  expect(screen.getByText(t.empty_participant)).toBeTruthy();
  room({ snapshot: { icebreaker: { prompt, responses: [] } } });
  expect(screen.getByText(t.no_responses)).toBeTruthy();
  expect(screen.queryByRole('button', { name: t.clear_prompt })).toBeNull();
  fireEvent.change(screen.getByLabelText(t.your_response), {
    target: { value: 'Binary search' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.send }));
  expect(sent()).toEqual([
    { kind: 'icebreaker.respond', text: 'Binary search' },
  ]);

  room({
    snapshot: {
      icebreaker: {
        prompt,
        responses: [
          { id: VISIBLE, participantId: ANA, text: 'Merge sort' },
          { id: HIDDEN, participantId: SELF, text: 'Binary search' },
        ],
      },
    },
    mine: { icebreaker: { text: 'Binary search' } },
  });
  expect(screen.getByText('Ana')).toBeTruthy();
  expect(screen.getByText('2 answers')).toBeTruthy();
  // The same text is already sent, so there is nothing to update yet.
  const update = screen.getByRole('button', { name: t.update });
  expect(update).toHaveProperty('disabled', true);
  expect(screen.queryByRole('button', { name: /Hide the answer/ })).toBeNull();
  fireEvent.change(screen.getByLabelText(t.your_response), {
    target: { value: 'Quick sort' },
  });
  fireEvent.click(update);
  expect(sent().at(-1)).toEqual({
    kind: 'icebreaker.respond',
    text: 'Quick sort',
  });
});
