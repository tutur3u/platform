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

import { IcebreakerPanel } from './icebreaker-panel';

const t = strings.icebreaker;
const VISIBLE = '88888888-8888-4888-8888-888888888888';
const HIDDEN = '99999999-9999-4999-8999-999999999999';
const PROMPT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEXT_PROMPT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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
        promptId: PROMPT,
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
  room({
    snapshot: { icebreaker: { prompt, promptId: PROMPT, responses: [] } },
  });
  expect(screen.getByText(t.no_responses)).toBeTruthy();
  expect(screen.queryByRole('button', { name: t.clear_prompt })).toBeNull();
  fireEvent.change(screen.getByLabelText(t.your_response), {
    target: { value: 'Binary search' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.send }));
  expect(sent()).toEqual([
    { kind: 'icebreaker.respond', promptId: PROMPT, text: 'Binary search' },
  ]);

  room({
    snapshot: {
      icebreaker: {
        prompt,
        promptId: PROMPT,
        responses: [
          { id: VISIBLE, participantId: ANA, text: 'Merge sort' },
          { id: HIDDEN, participantId: SELF, text: 'Binary search' },
        ],
      },
    },
    mine: { icebreaker: { promptId: PROMPT, text: 'Binary search' } },
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
    promptId: PROMPT,
    text: 'Quick sort',
  });
});

it('ties each reply to the question on screen and says when it arrived too late', () => {
  renderPanel(IcebreakerPanel, false);
  const store = room({
    snapshot: { icebreaker: { prompt, promptId: PROMPT, responses: [] } },
  });
  fireEvent.change(screen.getByLabelText(t.your_response), {
    target: { value: 'Binary search' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.send }));
  expect(sent().at(-1)).toMatchObject({ promptId: PROMPT });
  // The host asked the next question before that reply reached the room.
  act(() =>
    store.receive({
      type: 'error',
      error: 'activity_icebreaker_prompt_changed',
      requestId: lastRequestId(),
    })
  );
  expect(screen.getByRole('status').textContent).toBe(
    strings.errors.prompt_changed
  );
  room({
    snapshot: {
      icebreaker: { prompt, promptId: NEXT_PROMPT, responses: [] },
    },
  });
  // The same words asked again are a new question: the reply starts empty.
  const input = screen.getByLabelText(t.your_response) as HTMLInputElement;
  expect(input.value).toBe('');
  fireEvent.change(input, { target: { value: 'Merge sort' } });
  fireEvent.click(screen.getByRole('button', { name: t.send }));
  expect(sent().at(-1)).toEqual({
    kind: 'icebreaker.respond',
    promptId: NEXT_PROMPT,
    text: 'Merge sort',
  });
});

it('fills in a reply that arrives late and keeps typed text through a reconnect', () => {
  renderPanel(IcebreakerPanel, false);
  const asked = { icebreaker: { prompt, promptId: PROMPT, responses: [] } };
  const mine = { icebreaker: { promptId: PROMPT, text: 'Binary search' } };
  const input = () =>
    screen.getByLabelText(t.your_response) as HTMLInputElement;
  room({ snapshot: asked });
  expect(input().value).toBe('');
  // Their own reply reaches the panel after the question did.
  room({ snapshot: asked, mine });
  expect(input().value).toBe('Binary search');
  fireEvent.change(input(), { target: { value: 'Quick sort' } });
  reconnectRoom(() => {
    // The question stays on screen; sending has to wait, and says so.
    expect(screen.getByText(prompt)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.update }));
    expect(screen.getByRole('status').textContent).toBe(
      strings.errors.reconnecting
    );
  });
  expect(screen.queryByRole('status')).toBeNull();
  room({ snapshot: asked, mine });
  expect(input().value).toBe('Quick sort');
  expect(sent()).toEqual([]);
});

it('does not start the next question from the reply to the last one', () => {
  renderPanel(IcebreakerPanel, false);
  const reply = { icebreaker: { promptId: PROMPT, text: 'Binary search' } };
  room({
    snapshot: { icebreaker: { prompt, promptId: PROMPT, responses: [] } },
    mine: reply,
  });
  const input = () =>
    screen.getByLabelText(t.your_response) as HTMLInputElement;
  expect(input().value).toBe('Binary search');
  // The next question arrives before the room refreshes this person's reply.
  room({
    snapshot: {
      icebreaker: { prompt: 'Next?', promptId: NEXT_PROMPT, responses: [] },
    },
    mine: reply,
  });
  expect(input().value).toBe('');
  expect(screen.getByRole('button', { name: t.send })).toBeTruthy();
  expect(screen.queryByRole('button', { name: t.update })).toBeNull();
});
