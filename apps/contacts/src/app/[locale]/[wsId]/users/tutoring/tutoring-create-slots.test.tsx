// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { TutoringCreateSlots } from './tutoring-create-slots';
import { DEFAULT_FORM, type TutoringFormValues } from './tutoring-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { index?: number }) =>
    values?.index ? `${key} ${values.index}` : key,
}));
vi.mock('./tutoring-teacher-picker', () => ({
  TutoringTeacherPicker: () => null,
}));
vi.mock('@tuturuuu/ui/textarea', () => ({
  Textarea: (props: ComponentProps<'textarea'>) => <textarea {...props} />,
}));

afterEach(cleanup);

const slot = (sessionDate: string, extra: { content?: string } = {}) => ({
  durationMinutes: 45,
  sessionDate,
  startTime: '15:15',
  teacherUserId: 'tutor',
  ...extra,
});

function mount(form: TutoringFormValues, onChange = vi.fn()) {
  render(
    <TutoringCreateSlots
      conflictingIndexes={new Set()}
      form={form}
      onChange={onChange}
      teacherOptions={[]}
      wsId="center"
    />
  );
  return onChange;
}

it('gives each session of a multi-session draft its own content field', () => {
  const onChange = mount({
    ...DEFAULT_FORM,
    content: 'shared',
    sessionSlots: [
      slot('2026-10-31', { content: '2026-10-20: Unit 4' }),
      slot('2026-11-07'),
    ],
  });
  const fields = screen.getAllByRole('textbox');
  expect(fields).toHaveLength(2);
  // Each field is named by its session so a screen reader can tell them apart.
  expect(fields.map((field) => field.getAttribute('id'))).toEqual([
    'slotContent-0',
    'slotContent-1',
  ]);
  expect(screen.getByLabelText('content_for_session 1')).toBe(fields[0]);
  expect(screen.getByLabelText('content_for_session 2')).toBe(fields[1]);
  // The second session has no content of its own yet, so it shows the shared one.
  expect(fields.map((field) => (field as HTMLTextAreaElement).value)).toEqual([
    '2026-10-20: Unit 4',
    'shared',
  ]);

  fireEvent.change(fields[1] as HTMLElement, {
    target: { value: '2026-10-22: Unit 5' },
  });
  const next = onChange.mock.calls[0]?.[0] as TutoringFormValues;
  expect(next.sessionSlots.map((item) => item.content)).toEqual([
    '2026-10-20: Unit 4',
    '2026-10-22: Unit 5',
  ]);
  expect(next.content).toBe('shared');
});

it('leaves a single session to the form-level content field', () => {
  mount({ ...DEFAULT_FORM, sessionSlots: [slot('2026-10-31')] });
  expect(screen.queryByRole('textbox')).toBeNull();
});

it('shows the content help beside the per-session fields and describes each by it', () => {
  render(
    <TutoringCreateSlots
      conflictingIndexes={new Set()}
      contentHelp="Keep drafted notes to follow the class."
      form={{
        ...DEFAULT_FORM,
        sessionSlots: [slot('2026-10-31'), slot('2026-11-07')],
      }}
      onChange={vi.fn()}
      teacherOptions={[]}
      wsId="center"
    />
  );
  const help = screen.getByText('Keep drafted notes to follow the class.');
  for (const field of screen.getAllByRole('textbox'))
    expect(field.getAttribute('aria-describedby')).toBe(help.id);
});
