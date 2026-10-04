import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { updateTutoringPolicy } from '@tuturuuu/internal-api/tutoring';
import {
  EASY_CENTER_TUTORING_POLICY,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import { describe, expect, it, vi } from 'vitest';
import { TutoringPolicyCard } from './tutoring-policy-card';

vi.mock('@tuturuuu/internal-api/tutoring', () => ({
  updateTutoringPolicy: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function view(policy: TutoringPolicy, client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <TutoringPolicyCard
        canConfigure
        groups={[]}
        policy={policy}
        wsId="workspace"
      />
    </QueryClientProvider>
  );
}

describe('tutoring section save isolation', () => {
  it('preserves refreshed unrelated values and retains failed drafts with pending controls disabled', async () => {
    let rejectSave!: (error: Error) => void;
    vi.mocked(updateTutoringPolicy).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        })
    );
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const { rerender } = render(view(EASY_CENTER_TUTORING_POLICY, client));
    fireEvent.click(screen.getAllByRole('button', { name: 'policy_edit' })[1]!);
    fireEvent.change(screen.getByLabelText('policy_durationMinutes'), {
      target: { value: '90' },
    });
    const refreshed = {
      ...EASY_CENTER_TUTORING_POLICY,
      parentMessageTemplate: 'A refreshed synthetic template',
      campusByGroupId: {
        '11111111-1111-4111-8111-111111111111': 'Updated campus',
      },
    };
    rerender(view(refreshed, client));
    fireEvent.click(screen.getByRole('button', { name: 'policy_save' }));
    await waitFor(() =>
      expect(updateTutoringPolicy).toHaveBeenCalledWith('workspace', {
        ...refreshed,
        durationMinutes: 90,
        preset: 'custom',
      })
    );
    expect(
      screen.getByRole('button', { name: 'policy_cancel' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'policy_save' })).toBeDisabled();
    expect(screen.getByLabelText('policy_durationMinutes')).toBeDisabled();
    rejectSave(new Error('synthetic save failure'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'policy_save' })).toBeEnabled()
    );
    expect(screen.getByLabelText('policy_durationMinutes')).toHaveValue(90);
    fireEvent.click(screen.getByRole('button', { name: 'policy_cancel' }));
    expect(
      screen.getByText(refreshed.parentMessageTemplate)
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'policy_edit' })[1]!);
    expect(screen.getByLabelText('policy_durationMinutes')).toHaveValue(45);
  });

  it('does not enable save because only another section refreshed', () => {
    const client = new QueryClient();
    const { rerender } = render(view(EASY_CENTER_TUTORING_POLICY, client));
    fireEvent.click(screen.getAllByRole('button', { name: 'policy_edit' })[1]!);
    rerender(
      view(
        {
          ...EASY_CENTER_TUTORING_POLICY,
          parentMessageTemplate: 'New external template',
        },
        client
      )
    );
    expect(screen.getByRole('button', { name: 'policy_save' })).toBeDisabled();
  });
});
