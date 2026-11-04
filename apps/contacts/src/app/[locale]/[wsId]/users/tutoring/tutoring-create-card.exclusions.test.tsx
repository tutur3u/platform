import { render, screen } from '@testing-library/react';
import {
  EASY_CENTER_TUTORING_POLICY,
  STANDARD_TUTORING_POLICY,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { expect, it, vi } from 'vitest';
import { TutoringCreateCard } from './tutoring-create-card';
import { DEFAULT_FORM } from './tutoring-types';

vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => ({
    actorId: 'synthetic-actor',
    assertActive: () => {},
  }),
}));
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
vi.mock('./tutoring-draft-choices', () => ({
  TutoringDraftChoices: () => <span>Draft choices</span>,
}));
vi.mock('./tutoring-create-slots', () => ({
  TutoringCreateSlots: () => <span>Teacher per session</span>,
}));
vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    options,
    placeholder,
  }: {
    options: { label: string; value: string }[];
    placeholder: string;
  }) => (
    <ul aria-label={placeholder}>
      {options.map((option) => (
        <li key={option.value}>{option.label}</li>
      ))}
    </ul>
  ),
}));

// Synthetic classes only.
const groups = [
  { id: 'ddt', name: 'Starters ddt 2' },
  { id: 'kg', name: 'Mẫu giáo Hoa Mai' },
  { id: 'kg-en', name: 'Kindergarten K1' },
  { id: 'english', name: 'English A1' },
] as unknown as UserGroup[];

const props = {
  groups,
  isSubmitting: false,
  onChange: vi.fn(),
  onSubmit: vi.fn(),
  students: [],
  wsId: 'synthetic-ws',
};

function classOptions() {
  return Array.from(
    screen.getByRole('list', { name: 'select_group' }).querySelectorAll('li')
  ).map((item) => item.textContent);
}

it('offers no DDT or kindergarten class when arranging a session', () => {
  render(
    <TutoringCreateCard
      {...props}
      form={DEFAULT_FORM}
      policy={EASY_CENTER_TUTORING_POLICY}
    />
  );
  expect(classOptions()).toEqual(['English A1']);
});

it('offers every class under a custom policy without those rules', () => {
  render(
    <TutoringCreateCard
      {...props}
      form={DEFAULT_FORM}
      policy={{ ...STANDARD_TUTORING_POLICY, preset: 'custom' }}
    />
  );
  expect(classOptions()).toEqual([
    'Starters ddt 2',
    'Mẫu giáo Hoa Mai',
    'Kindergarten K1',
    'English A1',
  ]);
});

it('explains an excluded class and offers no suggestion or save for it', () => {
  render(
    <TutoringCreateCard
      {...props}
      form={{
        ...DEFAULT_FORM,
        groupId: 'ddt',
        studentUserId: 'learner',
        sessionSlots: [
          {
            durationMinutes: 45,
            sessionDate: '2026-10-07',
            startTime: '17:15',
            teacherUserId: 'tutor',
          },
        ],
      }}
      policy={EASY_CENTER_TUTORING_POLICY}
    />
  );
  expect(screen.getByText('group_excluded')).toBeInTheDocument();
  expect(screen.queryByText('suggest_all_sessions')).not.toBeInTheDocument();
  expect(screen.queryByText('Draft choices')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /create/ })).toBeDisabled();
});
