import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReferralSectionClient from './referral-section-client';

type ComboboxMockProps = {
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  onSearchChange?: (value: string) => void;
};

const {
  createWorkspaceUserReferralMock,
  deleteWorkspaceUserReferralMock,
  listWorkspaceUserReferralCandidatesMock,
  listWorkspaceUserReferralsMock,
} = vi.hoisted(() => ({
  createWorkspaceUserReferralMock: vi.fn(),
  deleteWorkspaceUserReferralMock: vi.fn(),
  listWorkspaceUserReferralCandidatesMock: vi.fn(),
  listWorkspaceUserReferralsMock: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
}));

vi.mock('@tuturuuu/internal-api/users', () => ({
  createWorkspaceUserReferral: createWorkspaceUserReferralMock,
  deleteWorkspaceUserReferral: deleteWorkspaceUserReferralMock,
  listWorkspaceUserReferralCandidates: listWorkspaceUserReferralCandidatesMock,
  listWorkspaceUserReferrals: listWorkspaceUserReferralsMock,
}));

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({ options, placeholder, onSearchChange }: ComboboxMockProps) => (
    <div>
      <input
        aria-label={placeholder}
        onChange={(event) => onSearchChange?.(event.currentTarget.value)}
        placeholder={placeholder}
      />
      <div data-testid="combobox-options">
        {options.map((option) => option.label).join(',')}
      </div>
    </div>
  ),
}));

vi.mock('@tuturuuu/users-ui/components/require-attention-name', () => ({
  RequireAttentionName: ({ name }: { name: string }) => <span>{name}</span>,
}));

function renderWithQueryClient(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  );
}

describe('ReferralSectionClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listWorkspaceUserReferralsMock.mockResolvedValue({
      count: 0,
      data: [],
    });
  });

  it('keeps referral search usable after an available-user query failure', async () => {
    listWorkspaceUserReferralCandidatesMock
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockResolvedValueOnce([
        {
          id: 'candidate-1',
          full_name: 'Linh Tran',
          display_name: null,
          email: 'linh@example.com',
          phone: null,
        },
      ]);

    renderWithQueryClient(
      <ReferralSectionClient
        wsId="ws-123"
        userId="user-123"
        canUpdateUsers
        workspaceSettings={{
          referral_count_cap: 3,
          referral_increment_percent: 10,
          referral_promotion_id: null,
          referral_reward_type: 'BOTH',
        }}
        initialAvailableUsers={[]}
        initialAvailableUsersCount={0}
        initialReferredUsers={[]}
      />
    );

    const searchInput = screen.getByRole('textbox', {
      name: 'search_person_to_refer_placeholder',
    });

    fireEvent.change(searchInput, { target: { value: 'mai' } });

    await waitFor(() => {
      expect(listWorkspaceUserReferralCandidatesMock).toHaveBeenCalledWith(
        'ws-123',
        'user-123',
        { q: 'mai' }
      );
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Rate limit exceeded'
    );
    expect(
      screen.getByRole('textbox', {
        name: 'search_person_to_refer_placeholder',
      })
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'search_person_to_refer_placeholder',
      }),
      { target: { value: 'linh' } }
    );

    await waitFor(() => {
      expect(listWorkspaceUserReferralCandidatesMock).toHaveBeenLastCalledWith(
        'ws-123',
        'user-123',
        { q: 'linh' }
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('combobox-options')).toHaveTextContent(
        'Linh Tran'
      );
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps referral selection available when referred users exceed the discount cap', () => {
    listWorkspaceUserReferralsMock.mockResolvedValue({
      count: 2,
      data: [
        {
          id: 'referred-1',
          full_name: 'Mai Nguyen',
          display_name: null,
          email: 'mai@example.com',
          phone: null,
        },
        {
          id: 'referred-2',
          full_name: 'Hoa Pham',
          display_name: null,
          email: 'hoa@example.com',
          phone: null,
        },
      ],
    });

    renderWithQueryClient(
      <ReferralSectionClient
        wsId="ws-123"
        userId="user-123"
        canUpdateUsers
        workspaceSettings={{
          referral_count_cap: 1,
          referral_increment_percent: 10,
          referral_promotion_id: null,
          referral_reward_type: 'BOTH',
        }}
        initialAvailableUsers={[
          {
            id: 'candidate-1',
            full_name: 'Linh Tran',
            display_name: null,
            email: 'linh@example.com',
            phone: null,
          },
        ]}
        initialAvailableUsersCount={1}
        initialReferredUsers={[
          {
            id: 'referred-1',
            full_name: 'Mai Nguyen',
            display_name: null,
            email: 'mai@example.com',
            phone: null,
          },
          {
            id: 'referred-2',
            full_name: 'Hoa Pham',
            display_name: null,
            email: 'hoa@example.com',
            phone: null,
          },
        ]}
      />
    );

    expect(screen.getByText('Mai Nguyen')).toBeInTheDocument();
    expect(screen.getByText('Hoa Pham')).toBeInTheDocument();
    expect(screen.getByText('select_person_to_refer')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', {
        name: 'search_person_to_refer_placeholder',
      })
    ).toBeInTheDocument();
    expect(screen.queryByText('reached_max_referrals')).not.toBeInTheDocument();
  });
});
