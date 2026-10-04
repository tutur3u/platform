import { fireEvent, render, screen } from '@testing-library/react';
import { EASY_CENTER_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { expect, it, vi } from 'vitest';
import { TutoringCreateCard } from './tutoring-create-card';
import { DEFAULT_FORM } from './tutoring-types';

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ isSuccess: true, data: { data: [] } }),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceUserGroupSessions: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./tutoring-people-picker', () => ({
  WorkspacePersonPicker: () => <span>Learner picker</span>,
}));
vi.mock('./tutoring-create-slots', () => ({
  TutoringCreateSlots: () => <span>Teacher per session</span>,
}));
vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    placeholder,
    onChange,
  }: {
    placeholder: string;
    onChange: (value: string) => void;
  }) => (
    <button type="button" onClick={() => onChange('class-b')}>
      {placeholder}
    </button>
  ),
}));

it('shows homeroom context and preserves the independently selected tutor on class changes', () => {
  const change = vi.fn();
  const form = {
    ...DEFAULT_FORM,
    groupId: 'class-a',
    sessionSlots: [
      {
        sessionDate: '2026-10-07',
        startTime: '17:15',
        durationMinutes: 45,
        teacherUserId: 'another-center-teacher',
      },
    ],
  };
  const groups = [
    {
      id: 'class-a',
      name: 'Class A',
      managers: [{ id: 'homeroom-a', full_name: 'Class A Teacher' }],
    },
    {
      id: 'class-b',
      name: 'Class B',
      managers: [{ id: 'homeroom-b', full_name: 'Class B Teacher' }],
    },
  ] as unknown as UserGroup[];
  render(
    <TutoringCreateCard
      form={form}
      groups={groups}
      isSubmitting={false}
      onChange={change}
      onSubmit={vi.fn()}
      policy={EASY_CENTER_TUTORING_POLICY}
      students={[]}
      wsId="center"
    />
  );
  expect(screen.getByText('homeroom_teacher:')).toBeInTheDocument();
  expect(screen.getByText('Class A Teacher')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'select_group' }));
  expect(change).toHaveBeenCalledWith(
    expect.objectContaining({
      groupId: 'class-b',
      sessionSlots: form.sessionSlots,
    })
  );
});
