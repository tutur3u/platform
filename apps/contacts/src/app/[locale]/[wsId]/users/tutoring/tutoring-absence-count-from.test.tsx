import { fireEvent, render, screen } from '@testing-library/react';
import {
  EASY_CENTER_TUTORING_POLICY,
  STANDARD_TUTORING_POLICY,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../../messages/en.json';
import vi_ from '../../../../../../messages/vi.json';
import { TutoringPolicyCard } from './tutoring-policy-card';

const state = vi.hoisted(() => ({ mutate: vi.fn() }));
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

function renderCard(policy: TutoringPolicy, canConfigure = true) {
  render(
    <TutoringPolicyCard
      canConfigure={canConfigure}
      groups={[]}
      policy={policy}
      wsId="workspace"
    />
  );
}

function editTiming() {
  fireEvent.click(screen.getAllByRole('button', { name: 'policy_edit' })[1]!);
}

describe('count absences from a chosen date', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves a chosen date from the timing section', () => {
    renderCard(EASY_CENTER_TUTORING_POLICY);
    editTiming();
    const input = screen.getByLabelText('policy_absenceCountFromDate');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('');
    expect(
      screen.getByText('policy_absenceCountFromDate_help')
    ).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'policy_save' }));
    expect(state.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        absenceCountFromDate: '2026-11-01',
        absenceLookbackDays: 21,
      })
    );
  });

  it('clears the date back to null', () => {
    renderCard({
      ...STANDARD_TUTORING_POLICY,
      absenceCountFromDate: '2026-11-01',
    });
    editTiming();
    expect(screen.getByLabelText('policy_absenceCountFromDate')).toHaveValue(
      '2026-11-01'
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'policy_absenceCountFromDate_clear' })
    );
    expect(screen.getByLabelText('policy_absenceCountFromDate')).toHaveValue(
      ''
    );
    fireEvent.click(screen.getByRole('button', { name: 'policy_save' }));
    expect(state.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ absenceCountFromDate: null })
    );
  });

  it('shows the date, or that none is set, in the summary', () => {
    renderCard(
      { ...STANDARD_TUTORING_POLICY, absenceCountFromDate: '2026-11-01' },
      false
    );
    expect(screen.getByText('policy_absenceCountFromDate')).toBeInTheDocument();
    expect(screen.getByText('2026-11-01')).toBeInTheDocument();
  });

  it('says no date is set when the policy has none', () => {
    renderCard(STANDARD_TUTORING_POLICY, false);
    expect(
      screen.getByText('policy_absenceCountFromDate_unset')
    ).toBeInTheDocument();
  });

  it('keeps the date when a preset is applied', () => {
    renderCard({
      ...STANDARD_TUTORING_POLICY,
      absenceCountFromDate: '2026-11-01',
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'policy_edit' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'policy_easy_center' }));
    fireEvent.click(screen.getByRole('button', { name: 'policy_save' }));
    expect(state.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: 'easy_center',
        absenceCountFromDate: '2026-11-01',
      })
    );
  });

  it('has English and Vietnamese labels', () => {
    const enMessages = en['ws-tutoring'];
    const viMessages = vi_['ws-tutoring'];
    expect(enMessages.policy_absenceCountFromDate).toBe('Count absences from');
    expect(viMessages.policy_absenceCountFromDate).toBe('Tính kèm từ ngày');
    for (const key of [
      'policy_absenceCountFromDate_help',
      'policy_absenceCountFromDate_clear',
      'policy_absenceCountFromDate_unset',
    ] as const) {
      expect(enMessages[key]).toBeTruthy();
      expect(viMessages[key]).toBeTruthy();
    }
    expect(enMessages.policy_absenceCountFromDate_help).toMatch(/not deleted/);
    expect(viMessages.policy_absenceCountFromDate_help).toMatch(/không bị xóa/);
  });
});
