import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanDetailsPollContent } from './poll-display';

const mocks = vi.hoisted(() => ({
  addPollOption: vi.fn(),
  createPoll: vi.fn(),
  deletePoll: vi.fn(),
  deletePollOption: vi.fn(),
  refresh: vi.fn(),
  submitVote: vi.fn(),
  toast: vi.fn(),
  toggleWherePoll: vi.fn(),
  useTimeBlocking: vi.fn(),
}));

vi.mock('@tuturuuu/apis/meet/actions', () => ({
  addPollOption: (...args: unknown[]) => mocks.addPollOption(...args),
  createPoll: (...args: unknown[]) => mocks.createPoll(...args),
  deletePoll: (...args: unknown[]) => mocks.deletePoll(...args),
  deletePollOption: (...args: unknown[]) => mocks.deletePollOption(...args),
  submitVote: (...args: unknown[]) => mocks.submitVote(...args),
  toggleWherePoll: (...args: unknown[]) => mocks.toggleWherePoll(...args),
}));

vi.mock('@tuturuuu/ui/hooks/time-blocking-provider', () => ({
  useTimeBlocking: () => mocks.useTimeBlocking(),
}));

vi.mock('@tuturuuu/ui/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./where-tu-meet', () => ({
  DefaultWherePollContent: ({
    onAddOption,
    onVote,
  }: {
    onAddOption: (pollId: string, value: string) => Promise<unknown>;
    onVote: (pollId: string, optionIds: string[]) => Promise<void>;
  }) => (
    <div>
      <button type="button" onClick={() => onAddOption('poll-1', 'Cafe')}>
        add guest option
      </button>
      <button type="button" onClick={() => onVote('poll-1', ['option-1'])}>
        submit guest vote
      </button>
    </div>
  ),
}));

describe('PlanDetailsPollContent guest authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useTimeBlocking.mockReturnValue({
      user: {
        display_name: 'Guest',
        id: 'guest-1',
        is_guest: true,
        password_hash: 'plan-bound-credential',
      },
    });
    mocks.addPollOption.mockResolvedValue({
      data: {
        option: {
          created_at: '2026-08-10T00:00:00.000Z',
          guestVotes: [],
          id: 'option-1',
          poll_id: 'poll-1',
          totalVotes: 0,
          userVotes: [],
          value: 'Cafe',
        },
      },
    });
    mocks.submitVote.mockResolvedValue({ data: { success: true } });
  });

  it('forwards the selected guest credential to option and vote actions', async () => {
    render(
      <PlanDetailsPollContent
        plan={{ id: 'plan-1', is_confirmed: false, where_to_meet: true }}
        isCreator={false}
        platformUser={null}
        polls={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'add guest option' }));
    fireEvent.click(screen.getByRole('button', { name: 'submit guest vote' }));

    await waitFor(() => {
      expect(mocks.addPollOption).toHaveBeenCalledWith('plan-1', {
        guestId: 'guest-1',
        guestPasswordHash: 'plan-bound-credential',
        pollId: 'poll-1',
        userType: 'GUEST',
        value: 'Cafe',
      });
      expect(mocks.submitVote).toHaveBeenCalledWith('plan-1', {
        guestId: 'guest-1',
        guestPasswordHash: 'plan-bound-credential',
        optionIds: ['option-1'],
        pollId: 'poll-1',
        userType: 'GUEST',
      });
    });
  });
});
