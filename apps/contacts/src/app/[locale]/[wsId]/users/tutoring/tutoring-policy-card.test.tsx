import { fireEvent, render, screen } from '@testing-library/react';
import { EASY_CENTER_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TutoringPolicyCard } from './tutoring-policy-card';

const GROUP = '11111111-1111-4111-8111-111111111111';
const state = vi.hoisted(() => ({ mutate: vi.fn(), invalidate: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
  useMutation: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock('@tuturuuu/internal-api/tutoring', () => ({
  updateTutoringPolicy: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('tutoring section settings', () => {
  beforeEach(() => vi.clearAllMocks());
  it('opens only the requested section and discards changes on cancel', () => {
    render(
      <TutoringPolicyCard
        canConfigure
        groups={[]}
        policy={EASY_CENTER_TUTORING_POLICY}
        wsId="workspace"
      />
    );
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'policy_edit' })).toHaveLength(
      8
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'policy_edit' })[1]!);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(7);
    expect(
      screen.queryByRole('textbox', { name: 'policy-parent-template' })
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('policy_durationMinutes'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'policy_cancel' }));
    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'policy_edit' })[1]!);
    expect(screen.getByLabelText('policy_durationMinutes')).toHaveValue(45);
    fireEvent.change(screen.getByLabelText('policy_durationMinutes'), {
      target: { value: '60' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'policy_save' }));
    expect(state.mutate).toHaveBeenCalledOnce();
  });
  it('keeps non-configuring members in a readable summary without forms', () => {
    render(
      <TutoringPolicyCard
        canConfigure={false}
        groups={[]}
        policy={EASY_CENTER_TUTORING_POLICY}
        wsId="workspace"
      />
    );
    expect(
      screen.queryByRole('button', { name: 'policy_edit' })
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(
      screen.getByText(
        'Shift 4: 08:00–09:30 · policy_weekday_0, policy_weekday_6'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('09:30 – 10:30')).toBeInTheDocument();
    expect(screen.getByText('policy_no_group_shifts')).toBeInTheDocument();
  });
  it('carries group assignments when a shift is renamed', () => {
    render(
      <TutoringPolicyCard
        canConfigure
        groups={[{ id: GROUP, name: 'Class A' }] as never}
        policy={{
          ...EASY_CENTER_TUTORING_POLICY,
          shiftByGroupId: { [GROUP]: 'Shift 2' },
        }}
        wsId="workspace"
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'policy_edit' })[2]!);
    fireEvent.change(screen.getByDisplayValue('Shift 2'), {
      target: { value: 'Ca 2' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'policy_save' }));
    expect(state.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ shiftByGroupId: { [GROUP]: 'Ca 2' } })
    );
  });
  it('warns in-app before saving a removed shift that groups still use', () => {
    render(
      <TutoringPolicyCard
        canConfigure
        groups={[]}
        policy={{
          ...EASY_CENTER_TUTORING_POLICY,
          shiftByGroupId: { [GROUP]: 'Shift 2' },
        }}
        wsId="workspace"
      />
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'policy_edit' })[2]!);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'policy_remove_exception' })[1]!
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'policy_group_shift_orphaned'
    );
    fireEvent.click(screen.getByRole('button', { name: 'policy_save' }));
    // Shift 3 now sits where Shift 2 was; its groups must not move there.
    expect(state.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ shiftByGroupId: { [GROUP]: 'Shift 2' } })
    );
  });
  it('shows each group with its assigned shift', () => {
    render(
      <TutoringPolicyCard
        canConfigure={false}
        groups={[{ id: GROUP, name: 'Class A' }] as never}
        policy={{
          ...EASY_CENTER_TUTORING_POLICY,
          shiftByGroupId: { [GROUP]: 'Shift 2' },
        }}
        wsId="workspace"
      />
    );
    expect(screen.getByText('Class A')).toBeInTheDocument();
    expect(screen.getByText('Shift 2')).toBeInTheDocument();
  });
});
