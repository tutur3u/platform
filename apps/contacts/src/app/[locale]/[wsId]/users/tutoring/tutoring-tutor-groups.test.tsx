import { act, fireEvent, render, screen } from '@testing-library/react';
import { EASY_CENTER_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TutoringPolicyCard } from './tutoring-policy-card';

const TUTOR_GROUP = '22222222-2222-4222-8222-222222222222';
const DELETED_GROUP = '44444444-4444-4444-8444-444444444444';
const state = vi.hoisted(() => ({ mutate: vi.fn(), tutorSelect: null as any }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock('@tuturuuu/internal-api/tutoring', () => ({
  updateTutoringPolicy: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
// The popover list needs browser APIs jsdom lacks; expose its props instead.
vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: (props: any) => {
    if (props.mode === 'multiple') state.tutorSelect = props;
    return null;
  },
}));

const groups = [
  { id: TUTOR_GROUP, name: 'Giáo viên kèm' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'English A' },
] as never[];

function renderCard(policy = EASY_CENTER_TUTORING_POLICY) {
  render(
    <TutoringPolicyCard
      canConfigure
      groups={groups}
      policy={policy}
      wsId="workspace"
    />
  );
}

describe('tutor group settings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves the chosen tutor groups with every other field kept', () => {
    const legacy = {
      ...EASY_CENTER_TUTORING_POLICY,
      campusByGroupId: {
        '11111111-1111-4111-8111-111111111111': 'Legacy Annex',
      },
    };
    renderCard(legacy);
    fireEvent.click(screen.getAllByRole('button', { name: 'policy_edit' })[6]!);
    expect(state.tutorSelect.options).toEqual([
      { label: 'Giáo viên kèm', value: TUTOR_GROUP },
      { label: 'English A', value: '33333333-3333-4333-8333-333333333333' },
    ]);
    expect(screen.getByRole('button', { name: 'policy_save' })).toBeDisabled();
    act(() => state.tutorSelect.onChange([TUTOR_GROUP]));
    fireEvent.click(screen.getByRole('button', { name: 'policy_save' }));
    expect(state.mutate).toHaveBeenCalledWith({
      ...legacy,
      tutorGroupIds: [TUTOR_GROUP],
      preset: 'custom',
    });
  });

  it('lists tutor groups in the summary and keeps a deleted group removable', () => {
    renderCard({
      ...EASY_CENTER_TUTORING_POLICY,
      tutorGroupIds: [TUTOR_GROUP, DELETED_GROUP],
    });
    expect(screen.getByText('Giáo viên kèm')).toBeInTheDocument();
    expect(screen.getByText(DELETED_GROUP)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'policy_edit' })[6]!);
    expect(state.tutorSelect.selected).toEqual([TUTOR_GROUP, DELETED_GROUP]);
    expect(state.tutorSelect.options).toContainEqual({
      label: DELETED_GROUP,
      value: DELETED_GROUP,
    });
  });
});
