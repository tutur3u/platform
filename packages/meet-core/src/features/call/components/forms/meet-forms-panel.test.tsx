// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../../apps/meet/messages/en.json';
import { MeetFormsPanel } from './meet-forms-panel';
import type {
  MeetFormsAnswers,
  MeetFormsDefinition,
  MeetFormsPanelProps,
} from './types';

const binding = {
  launchId: 'launch-1',
  formId: 'form-1',
  versionId: 'version-1',
};
const definition: MeetFormsDefinition = {
  launchId: binding.launchId,
  id: binding.formId,
  versionId: binding.versionId,
  title: 'Workshop feedback',
  sections: [
    {
      id: 'general',
      title: 'General',
      questions: [
        { id: 'name', type: 'short_text', title: 'Name', required: true },
        { id: 'skip', type: 'short_text', title: 'Skip the second section?' },
      ],
    },
    {
      id: 'detail',
      title: 'More feedback',
      questions: [
        { id: 'details', type: 'long_text', title: 'Details', required: true },
      ],
    },
  ],
  logicRules: [
    {
      sourceQuestionId: 'skip',
      comparisonValue: 'yes',
      actionType: 'submit',
    },
  ],
};

function Fixture({
  initialAnswers = {},
  ...props
}: Omit<MeetFormsPanelProps, 'answers' | 'onAnswersChange'> & {
  initialAnswers?: MeetFormsAnswers;
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  return (
    <NextIntlClientProvider
      locale="en"
      messages={{ meet: { call: { forms: messages.meet.call.forms } } }}
      timeZone="UTC"
    >
      <MeetFormsPanel
        {...props}
        answers={answers}
        onAnswersChange={setAnswers}
      />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('validates the visible section and excludes retained answers after a branch changes', async () => {
  const onSubmit = vi.fn(async () => {});
  render(
    <Fixture state={{ kind: 'open', form: definition }} onSubmit={onSubmit} />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Answer this question to continue.')).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole('textbox', { name: 'Name Required' })
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Name Required' }), {
    target: { value: 'Avery' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Details Required' }), {
    target: { value: 'Please add a short break.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));

  const skip = screen.getByRole('textbox', {
    name: 'Skip the second section?',
  });
  fireEvent.change(skip, { target: { value: 'yes' } });
  fireEvent.change(skip, { target: { value: 'no' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(
    screen.getByRole<HTMLTextAreaElement>('textbox', {
      name: 'Details Required',
    }).value
  ).toBe('Please add a short break.');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Skip the second section?' }),
    { target: { value: 'yes' } }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));

  await screen.findByText('Response submitted.');
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
    ...binding,
    answers: { name: 'Avery', skip: 'yes' },
  });
});

it('fetches prefill only on explicit opt-in and preserves the editable draft', async () => {
  const onSubmit = vi.fn(async () => {});
  const onPrefill = vi.fn(async () => ({
    name: 'Suggested name',
    details: 'Suggested details',
    unrequested: 'private',
  }));
  render(
    <Fixture
      state={{ kind: 'open', form: definition }}
      initialAnswers={{ name: 'My edited name' }}
      onSubmit={onSubmit}
      onPrefill={onPrefill}
    />
  );

  expect(onPrefill).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Use my details' }));
  await waitFor(() =>
    expect(onPrefill).toHaveBeenCalledExactlyOnceWith(binding)
  );
  expect(
    screen.getByRole<HTMLInputElement>('textbox', { name: 'Name Required' })
      .value
  ).toBe('My edited name');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLTextAreaElement>('textbox', {
        name: 'Details Required',
      }).value
    ).toBe('Suggested details')
  );
  const submit = screen.getByRole<HTMLButtonElement>('button', {
    name: 'Submit response',
  });
  const consent = screen.getByRole('checkbox', {
    name: 'I agree to send these details.',
  });
  expect(submit.disabled).toBe(true);
  expect(
    screen.getByText('Suggested details', { selector: 'dd' })
  ).toBeTruthy();
  expect(screen.queryByText('private')).toBeNull();

  fireEvent.click(consent);
  fireEvent.change(screen.getByRole('textbox', { name: 'Details Required' }), {
    target: { value: 'Revised details' },
  });
  expect(submit.disabled).toBe(true);
  expect(screen.getByText('Revised details', { selector: 'dd' })).toBeTruthy();
  fireEvent.click(consent);
  fireEvent.click(submit);
  await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  expect(onSubmit).toHaveBeenCalledWith({
    ...binding,
    answers: { name: 'My edited name', details: 'Revised details' },
  });
});

it('attaches only server references and binds both transports to the launch and version', async () => {
  const onUpload = vi.fn(async () => 'upload-ref');
  const onSubmit = vi.fn(async () => {});
  const form: MeetFormsDefinition = {
    ...definition,
    logicRules: [],
    sections: [
      {
        id: 'files',
        questions: [
          {
            type: 'file_upload',
            id: 'attachment',
            title: 'Attach your work',
            required: true,
          },
        ],
      },
    ],
  };
  render(
    <Fixture
      state={{ kind: 'open', form }}
      onSubmit={onSubmit}
      onUpload={onUpload}
      gates={{ uploads: true }}
    />
  );
  const file = new File(['synthetic'], 'work.txt', { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText(/Attach your work/), {
    target: { files: [file] },
  });

  await screen.findByText('1 attached');
  expect(onUpload).toHaveBeenCalledExactlyOnceWith({
    ...binding,
    questionId: 'attachment',
    file,
    signal: expect.any(AbortSignal),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));
  await screen.findByText('Response submitted.');
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
    ...binding,
    answers: { attachment: ['upload-ref'] },
  });
});

it('ignores other versions and renders only disclosed parts of the server result', () => {
  const onSubmit = vi.fn(async () => {});
  const state = {
    kind: 'closed',
    form: definition,
  } satisfies MeetFormsPanelProps['state'];
  const { rerender } = render(
    <Fixture
      state={state}
      onSubmit={onSubmit}
      gates={{ grading: true }}
      result={{
        ...binding,
        versionId: 'old-version',
        kind: 'graded',
        score: { earned: 5, possible: 5 },
      }}
    />
  );

  expect(screen.getByText('This form is closed.')).toBeTruthy();
  expect(screen.queryByText('Score 5 / 5')).toBeNull();

  rerender(
    <Fixture
      state={state}
      onSubmit={onSubmit}
      gates={{ grading: true }}
      result={{ ...binding, kind: 'graded', score: { earned: 3, possible: 5 } }}
    />
  );
  expect(screen.getByText('Score 3 / 5')).toBeTruthy();
  expect(screen.queryByText('Correct answer')).toBeNull();

  rerender(
    <Fixture
      state={state}
      onSubmit={onSubmit}
      gates={{ grading: true }}
      result={{
        ...binding,
        kind: 'graded',
        reveal: [{ questionId: 'skip', answer: 'yes' }],
      }}
    />
  );
  expect(screen.getByText('yes')).toBeTruthy();
  expect(screen.queryByText('Score 3 / 5')).toBeNull();
});

it('preserves answers after a transport error and lets the respondent retry', async () => {
  const onSubmit = vi
    .fn<MeetFormsPanelProps['onSubmit']>()
    .mockRejectedValueOnce(new Error('Network unavailable'))
    .mockResolvedValueOnce(undefined);
  render(
    <Fixture
      state={{ kind: 'open', form: definition }}
      onSubmit={onSubmit}
      initialAnswers={{ name: 'Avery', skip: 'yes' }}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));
  await screen.findByRole('alert');
  expect(
    screen.getByRole<HTMLInputElement>('textbox', { name: 'Name Required' })
      .value
  ).toBe('Avery');
  fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));
  await screen.findByText('Response submitted.');
  expect(onSubmit).toHaveBeenCalledTimes(2);
});

const gatedForm: MeetFormsDefinition = {
  ...definition,
  logicRules: [],
  sections: [
    {
      id: 'mixed',
      questions: [
        { id: 'name', type: 'short_text', title: 'Name', required: true },
        {
          id: 'grid',
          type: 'matrix',
          title: 'Rate each part',
          rows: [{ id: 'pace', label: 'Pace' }],
          columns: [{ id: 'good', label: 'Good' }],
        },
        { id: 'attachment', type: 'file_upload', title: 'Attach your work' },
      ],
    },
  ],
};

it('withholds matrix and upload questions and omits their answers from the submission', async () => {
  const onSubmit = vi.fn(async () => {});
  const onUpload = vi.fn(async () => 'upload-ref');
  render(
    <Fixture
      state={{ kind: 'open', form: gatedForm }}
      initialAnswers={{
        name: 'Avery',
        grid: { pace: 'good' },
        attachment: ['stale-ref'],
      }}
      onSubmit={onSubmit}
      onUpload={onUpload}
    />
  );

  expect(
    screen.getByText('Grid questions are unavailable in this call.')
  ).toBeTruthy();
  expect(
    screen.getByText('File uploads are unavailable in this call.')
  ).toBeTruthy();
  expect(screen.queryByLabelText(/Attach your work/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));
  await screen.findByText('Response submitted.');
  expect(onUpload).not.toHaveBeenCalled();
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
    ...binding,
    answers: { name: 'Avery' },
  });
});

it('blocks submission when a withheld question is required', () => {
  const onSubmit = vi.fn(async () => {});
  const form: MeetFormsDefinition = {
    ...gatedForm,
    sections: [
      {
        id: 'mixed',
        questions: [
          {
            id: 'attachment',
            type: 'file_upload',
            title: 'Attach',
            required: true,
          },
        ],
      },
    ],
  };
  render(<Fixture state={{ kind: 'open', form }} onSubmit={onSubmit} />);

  expect(
    screen.getByText('Responses are unavailable for this form in Meet.')
  ).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Submit response' })
      .disabled
  ).toBe(true);
  expect(onSubmit).not.toHaveBeenCalled();
});

it('discloses no score or answers without the grading gate', () => {
  render(
    <Fixture
      state={{ kind: 'closed', form: definition }}
      onSubmit={vi.fn(async () => {})}
      result={{
        ...binding,
        kind: 'graded',
        score: { earned: 3, possible: 5 },
        reveal: [{ questionId: 'skip', answer: 'yes' }],
      }}
    />
  );

  expect(screen.queryByText('Score 3 / 5')).toBeNull();
  expect(screen.queryByText('Correct answer')).toBeNull();
});
