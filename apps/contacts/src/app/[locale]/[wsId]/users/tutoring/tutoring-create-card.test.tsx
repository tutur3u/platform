import { fireEvent, render, screen } from '@testing-library/react';
import { EASY_CENTER_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
const { pickerProps } = vi.hoisted(() => ({ pickerProps: vi.fn() }));
vi.mock('./tutoring-people-picker', () => ({
  WorkspacePersonPicker: (props: { groupId?: string }) => {
    pickerProps(props);
    return <span>Learner picker</span>;
  },
}));
vi.mock('./tutoring-draft-choices', () => ({
  TutoringDraftChoices: () => null,
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

it('hints which missed dates have no recorded lesson notes', () => {
  const props = {
    groups: [],
    isSubmitting: false,
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    policy: EASY_CENTER_TUTORING_POLICY,
    students: [],
    wsId: 'center',
  };
  const { rerender } = render(
    <TutoringCreateCard {...props} form={DEFAULT_FORM} />
  );
  expect(screen.queryByText('lesson_notes_missing')).not.toBeInTheDocument();
  rerender(
    <TutoringCreateCard
      {...props}
      form={{ ...DEFAULT_FORM, missingLessonDates: ['2026-10-22'] }}
    />
  );
  expect(screen.getByText('lesson_notes_missing')).toBeInTheDocument();
});

describe('student picker group scope (tutoring_student_picker_group_only)', () => {
  const groups = [
    { id: 'class-a', name: 'Class A', managers: [] },
    { id: 'class-b', name: 'Class B', managers: [] },
  ] as unknown as UserGroup[];
  const withStudent = {
    ...DEFAULT_FORM,
    groupId: 'class-a',
    studentLabel: 'Learner A',
    studentUserId: 'learner-a',
  };
  const renderCard = (
    form: typeof DEFAULT_FORM,
    studentPickerGroupOnly?: boolean,
    onChange = vi.fn()
  ) =>
    render(
      <TutoringCreateCard
        form={form}
        groups={groups}
        isSubmitting={false}
        onChange={onChange}
        onSubmit={vi.fn()}
        policy={EASY_CENTER_TUTORING_POLICY}
        students={[]}
        studentPickerGroupOnly={studentPickerGroupOnly}
        wsId="center"
      />
    );
  const lastGroupScope = () => pickerProps.mock.lastCall?.[0].groupId;

  beforeEach(() => pickerProps.mockClear());

  it.each([undefined, false])(
    'flag %s lists all workspace users even with a group selected',
    (flag) => {
      renderCard(withStudent, flag);
      expect(lastGroupScope()).toBeUndefined();
    }
  );

  it('flag ON lists only members of the selected group', () => {
    renderCard(withStudent, true);
    expect(lastGroupScope()).toBe('class-a');
  });

  it('flag ON with no group selected lists all workspace users (today)', () => {
    renderCard(DEFAULT_FORM, true);
    expect(lastGroupScope()).toBeUndefined();
  });

  it('flag ON clears a selected learner when the group changes', () => {
    const change = vi.fn();
    renderCard(withStudent, true, change);
    fireEvent.click(screen.getByRole('button', { name: 'select_group' }));
    expect(change).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'class-b',
        studentLabel: undefined,
        studentUserId: '',
      })
    );
  });

  it('flag OFF keeps the selected learner when the group changes', () => {
    const change = vi.fn();
    renderCard(withStudent, false, change);
    fireEvent.click(screen.getByRole('button', { name: 'select_group' }));
    expect(change).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'class-b',
        studentLabel: 'Learner A',
        studentUserId: 'learner-a',
      })
    );
  });
});
