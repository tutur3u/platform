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
  reconnectRoom,
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
const ATTEMPT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
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
  attemptId: ATTEMPT,
  released: false,
  sealed: false,
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
        attemptId: ATTEMPT,
        released: false,
        sealed: false,
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
  // Opening names the saved draft and the status it leaves.
  expect(sent().at(-1)).toEqual({
    kind: 'assessment.status',
    status: 'open',
    attemptId: ATTEMPT,
    from: 'draft',
  });
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
          { itemId: CHOICE, participantId: ANA, choice: 1, revision: 0 },
          {
            itemId: LONG,
            participantId: ANA,
            answer: 'It keeps equal keys in order.',
            revision: 2,
          },
        ],
      },
    },
  });
  expect(screen.getByText('It keeps equal keys in order.')).toBeTruthy();
  expect(screen.getByText(t.correct)).toBeTruthy();
  // While answers can still change, nothing is graded or released.
  expect(screen.queryByLabelText('Score for Ana, 0 to 100')).toBeNull();
  expect(screen.getByRole('button', { name: t.release })).toHaveProperty(
    'disabled',
    true
  );
  expect(screen.getByText(t.release_hint)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t.close_answers }));
  expect(sent()).toEqual([
    {
      kind: 'assessment.status',
      status: 'closed',
      attemptId: ATTEMPT,
      from: 'open',
    },
  ]);

  const closed = { ...open, status: 'closed' as const };
  const store = room({ manager: true, snapshot: { assessment: closed } });
  fireEvent.change(screen.getByLabelText('Score for Ana, 0 to 100'), {
    target: { value: '85' },
  });
  fireEvent.change(screen.getByLabelText('Feedback for Ana'), {
    target: { value: 'Good reasoning' },
  });
  fireEvent.click(screen.getByRole('button', { name: t.grade }));
  // The grade names the answer revision the host read.
  expect(sent().at(-1)).toEqual({
    kind: 'assessment.grade',
    attemptId: ATTEMPT,
    itemId: LONG,
    participantId: ANA,
    revision: 2,
    score: 85,
    feedback: 'Good reasoning',
  });
  // A grade for an answer that was rewritten meanwhile is refused, and said.
  act(() =>
    store.receive({
      type: 'error',
      error: 'activity_answer_changed',
      requestId: lastRequestId(),
    })
  );
  expect(screen.getByRole('status').textContent).toBe(
    strings.errors.answer_changed
  );
  fireEvent.click(screen.getByRole('button', { name: t.release }));
  expect(sent().at(-1)).toEqual({
    kind: 'assessment.release',
    released: true,
    attemptId: ATTEMPT,
  });

  // Closed without a release: answers can simply open again.
  expect(screen.getByRole('button', { name: t.reopen })).toBeTruthy();
  // Released: the attempt is final. The way on is a new attempt, which clears
  // the answers, so it asks twice.
  room({
    manager: true,
    snapshot: { assessment: { ...closed, released: true, sealed: true } },
  });
  expect(screen.queryByRole('button', { name: t.reopen })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: t.new_attempt }));
  // A dialog asks first: opening it and cancelling it send nothing.
  const dialog = screen.getByRole('alertdialog');
  expect(within(dialog).getByText(t.reopen_hint)).toBeTruthy();
  expect(sent()).toHaveLength(3);
  fireEvent.click(
    within(dialog).getByRole('button', { name: strings.cancel })
  );
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(sent()).toHaveLength(3);
  // Only the destructive confirm sends, and it is its own command, never a
  // plain reopen.
  fireEvent.click(screen.getByRole('button', { name: t.new_attempt }));
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: t.reopen_confirm,
    })
  );
  expect(sent()).toHaveLength(4);
  expect(sent().at(-1)).toEqual({
    kind: 'assessment.restart',
    attemptId: ATTEMPT,
  });
  expect(screen.queryByRole('alertdialog')).toBeNull();
  // Hiding the results again does not bring the plain Reopen back.
  room({
    manager: true,
    snapshot: { assessment: { ...closed, sealed: true } },
  });
  expect(screen.getByRole('button', { name: t.new_attempt })).toBeTruthy();
  expect(screen.queryByRole('button', { name: t.reopen })).toBeNull();

  // Going back to the questions clears answers, so it asks twice as well.
  fireEvent.click(screen.getByRole('button', { name: t.edit }));
  expect(sent()).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: t.edit_confirm }));
  expect(sent().at(-1)).toEqual({
    kind: 'assessment.status',
    status: 'draft',
    attemptId: ATTEMPT,
    from: 'closed',
  });
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
  // The mark is said in words, so it does not depend on seeing a colour.
  expect(
    within(choices).getByRole('radio', {
      name: new RegExp(`Merge sort\\s*${strings.options.correct_choice}`),
    })
  ).toBeTruthy();
  expect(
    within(choices).getByRole('radio', { name: 'Quick sort' })
  ).toBeTruthy();
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

it('fills in a written answer that arrives late and keeps typed text through a reconnect', () => {
  renderPanel(AssessmentPanel, false);
  const saved = { assessment: { [LONG]: { answer: 'Saved earlier' } } };
  const field = () =>
    screen.getByLabelText(t.your_answer) as HTMLTextAreaElement;
  room({ snapshot: { assessment: open } });
  expect(field().value).toBe('');
  // Their own answer reaches the panel after the questions did.
  room({ snapshot: { assessment: open }, mine: saved });
  expect(field().value).toBe('Saved earlier');
  fireEvent.change(field(), { target: { value: 'Typed since' } });
  reconnectRoom();
  // The questions never left the screen, and neither did the text.
  expect(field().value).toBe('Typed since');
  room({ snapshot: { assessment: open }, mine: saved });
  expect(field().value).toBe('Typed since');
});

it('keeps a question the host is writing when the room repeats its state', () => {
  renderPanel(AssessmentPanel, true);
  const draft = {
    snapshot: {
      assessment: {
        status: 'draft' as const,
        attemptId: ATTEMPT,
        released: false,
        sealed: false,
        items: [items[0]!],
        counts: { [CHOICE]: 0 },
      },
    },
    host: { assessment: { responses: [], answers: { [CHOICE]: 0 } } },
  };
  room({ manager: true, ...draft });
  fireEvent.click(screen.getByRole('button', { name: t.add_question }));
  const prompts = () =>
    (screen.getAllByLabelText(t.prompt) as HTMLInputElement[]).map(
      ({ value }) => value
    );
  fireEvent.change(screen.getAllByLabelText(t.prompt)[1]!, {
    target: { value: 'Half written' },
  });
  reconnectRoom();
  room({ manager: true, ...draft });
  expect(prompts()).toEqual(['Which sort is stable?', 'Half written']);
});

it('moves through the options with the arrow keys and answers only on a pick', () => {
  renderPanel(AssessmentPanel, false);
  room({ snapshot: { assessment: open } });
  const [first, second] = screen.getAllByRole('radio') as HTMLButtonElement[];
  // The group is one tab stop.
  expect([first!.tabIndex, second!.tabIndex]).toEqual([0, -1]);
  first!.focus();
  fireEvent.keyDown(first!, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(second);
  // The ends wrap around.
  fireEvent.keyDown(second!, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first!, { key: 'ArrowUp' });
  expect(document.activeElement).toBe(second);
  fireEvent.keyDown(second!, { key: 'Home' });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first!, { key: 'End' });
  expect(document.activeElement).toBe(second);
  // Moving focus sends nothing: an answer goes out only when it is picked.
  expect(sent()).toEqual([]);
  fireEvent.click(second!);
  expect(sent()).toEqual([
    { kind: 'assessment.submit', itemId: CHOICE, choice: 1 },
  ]);
});

it('changes the kind of a question with the arrow keys', () => {
  renderPanel(AssessmentPanel, true);
  fireEvent.click(screen.getByRole('button', { name: t.add_question }));
  const short = screen.getByRole('radio', { name: t.kind_short });
  const long = screen.getByRole('radio', { name: t.kind_long });
  expect([short.tabIndex, long.tabIndex]).toEqual([0, -1]);
  short.focus();
  fireEvent.keyDown(short, { key: 'ArrowRight' });
  // A draft setting follows focus, as a native radio group does.
  expect(document.activeElement).toBe(long);
  expect(long.getAttribute('aria-checked')).toBe('true');
  expect(short.getAttribute('aria-checked')).toBe('false');
});
