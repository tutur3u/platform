// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ANA,
  closeRoom,
  lastRequestId,
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

import { AssessmentPanel } from './assessment-panel';

const t = strings.assessment;
const CHOICE = '33333333-3333-4333-8333-333333333333';
const LONG = '44444444-4444-4444-8444-444444444444';
const items = [
  {
    id: CHOICE,
    prompt: 'Which sort is stable?',
    kind: 'choice' as const,
    options: ['Merge sort', 'Quick sort'],
  },
  { id: LONG, prompt: 'Explain why.', kind: 'long' as const },
];
const open = {
  status: 'open' as const,
  released: false,
  items,
  counts: { [CHOICE]: 0, [LONG]: 0 },
};

afterEach(() => {
  cleanup();
  closeRoom();
});

it('lets the host write a choice question, save it and open it once the room has it', () => {
  renderPanel(AssessmentPanel, true);
  expect(screen.getByText(t.empty_host)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.add_question }));
  fireEvent.change(screen.getByLabelText(t.prompt), {
    target: { value: 'Which sort is stable?' },
  });
  const save = screen.getByRole('button', { name: t.save });
  fireEvent.click(screen.getByRole('radio', { name: t.kind_choice }));
  // A choice question cannot be saved with empty options.
  expect(save).toHaveProperty('disabled', true);
  fireEvent.change(screen.getByLabelText('Option 1'), {
    target: { value: 'Merge sort' },
  });
  fireEvent.change(screen.getByLabelText('Option 2'), {
    target: { value: 'Quick sort' },
  });
  fireEvent.click(screen.getByLabelText('Mark option 1 as correct'));
  fireEvent.click(save);
  expect(sent()).toEqual([
    {
      kind: 'assessment.set',
      items: [
        {
          prompt: 'Which sort is stable?',
          kind: 'choice',
          options: ['Merge sort', 'Quick sort'],
          answer: 0,
        },
      ],
    },
  ]);
  expect(screen.getByRole('button', { name: t.open })).toHaveProperty(
    'disabled',
    true
  );

  room({
    manager: true,
    snapshot: {
      assessment: {
        status: 'draft',
        released: false,
        items: [items[0]!],
        counts: { [CHOICE]: 0 },
      },
    },
    host: { assessment: { responses: [], answers: { [CHOICE]: 0 } } },
  });
  // The saved answer key comes back, so the draft is clean and can open.
  expect(
    (screen.getByLabelText('Mark option 1 as correct') as HTMLInputElement)
      .checked
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: t.open }));
  expect(sent().at(-1)).toEqual({ kind: 'assessment.status', status: 'open' });
});

it('shows the host each answer, grades written ones and releases results', () => {
  renderPanel(AssessmentPanel, true);
  room({
    manager: true,
    snapshot: {
      assessment: { ...open, counts: { [CHOICE]: 1, [LONG]: 1 } },
    },
    host: {
      assessment: {
        answers: { [CHOICE]: 0 },
        responses: [
          { itemId: CHOICE, participantId: ANA, choice: 1 },
          {
            itemId: LONG,
            participantId: ANA,
            answer: 'It keeps equal keys in order.',
          },
        ],
      },
    },
  });
  expect(screen.getByText('It keeps equal keys in order.')).toBeTruthy();
  expect(screen.getByText(t.correct)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Score for Ana, 0 to 100'), {
    target: { value: '85' },
  });
  fireEvent.change(screen.getByLabelText('Feedback for Ana'), {
    target: { value: 'Good reasoning' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.grade }));
  // While answers can still change, results cannot be released.
  expect(screen.getByRole('button', { name: t.release })).toHaveProperty(
    'disabled',
    true
  );
  expect(screen.getByText(t.release_hint)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.close_answers }));
  expect(sent()).toEqual([
    {
      kind: 'assessment.grade',
      itemId: LONG,
      participantId: ANA,
      score: 85,
      feedback: 'Good reasoning',
    },
    { kind: 'assessment.status', status: 'closed' },
  ]);

  const closed = { ...open, status: 'closed' as const };
  room({ manager: true, snapshot: { assessment: closed } });
  fireEvent.click(screen.getByRole('button', { name: t.release }));
  expect(sent().at(-1)).toEqual({ kind: 'assessment.release', released: true });

  // Released: reopening would withdraw the results, so it asks twice.
  room({
    manager: true,
    snapshot: { assessment: { ...closed, released: true } },
  });
  fireEvent.click(screen.getByRole('button', { name: t.reopen }));
  expect(sent()).toHaveLength(3);
  expect(screen.getByText(t.reopen_hint)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.reopen_confirm }));
  expect(sent().at(-1)).toEqual({ kind: 'assessment.status', status: 'open' });

  // Going back to the questions clears answers, so it asks twice as well.
  fireEvent.click(screen.getByRole('button', { name: t.edit }));
  expect(sent()).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: t.edit_confirm }));
  expect(sent().at(-1)).toEqual({ kind: 'assessment.status', status: 'draft' });
});

it('lets a participant answer while open and shows only their own result on release', () => {
  renderPanel(AssessmentPanel, false);
  expect(screen.getByText(t.empty_participant)).toBeTruthy();
  room({ snapshot: { assessment: open } });
  fireEvent.click(screen.getByRole('radio', { name: 'Quick sort' }));
  fireEvent.change(screen.getByLabelText(t.your_answer), {
    target: { value: 'It keeps equal keys in order.' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.submit }));
  expect(sent()).toEqual([
    { kind: 'assessment.submit', itemId: CHOICE, choice: 1 },
    {
      kind: 'assessment.submit',
      itemId: LONG,
      answer: 'It keeps equal keys in order.',
    },
  ]);
  expect(screen.queryByRole('button', { name: t.save })).toBeNull();

  room({
    snapshot: {
      assessment: {
        ...open,
        status: 'closed',
        released: true,
        items: [{ ...items[0]!, correct: 0 }, items[1]!],
      },
    },
    mine: {
      assessment: {
        [CHOICE]: { choice: 1 },
        [LONG]: {
          answer: 'It keeps equal keys in order.',
          score: 85,
          feedback: 'Good reasoning',
        },
      },
    },
  });
  expect(screen.getByText(t.released_note)).toBeTruthy();
  expect(screen.getByText('Your score: 85')).toBeTruthy();
  expect(screen.getByText('Good reasoning')).toBeTruthy();
  const choices = screen.getByRole('radiogroup', {
    name: 'Which sort is stable?',
  });
  // Closed: the options are read-only and the right one is marked.
  for (const option of within(choices).getAllByRole('radio'))
    expect(option).toHaveProperty('disabled', true);
  expect(screen.queryByRole('button', { name: t.submit })).toBeNull();
});

it("says quietly when the room refuses this person's last action", () => {
  renderPanel(AssessmentPanel, false);
  const store = room({ snapshot: { assessment: open } });
  fireEvent.click(screen.getByRole('radio', { name: 'Merge sort' }));
  act(() =>
    store.receive({
      type: 'error',
      error: 'activity_rate_limited',
      requestId: lastRequestId(),
    })
  );
  expect(screen.getByRole('status').textContent).toBe(
    strings.errors.rate_limited
  );
});
