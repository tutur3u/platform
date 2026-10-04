import { fireEvent, render, screen } from '@testing-library/react';
import { EASY_CENTER_TUTORING_POLICY } from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TutoringPolicyCard } from './tutoring-policy-card';

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
      6
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
    expect(screen.getByText('Shift 4: 08:00')).toBeInTheDocument();
    expect(screen.getByText('09:30 – 10:30')).toBeInTheDocument();
  });
});
