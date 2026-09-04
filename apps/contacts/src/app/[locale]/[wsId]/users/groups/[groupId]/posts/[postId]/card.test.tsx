/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UserGroupPost } from '@tuturuuu/types/db';
import type { GroupPostRecipientRow } from '@tuturuuu/users-core/lib/group-post-recipient-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UserCard from './card';

const api = vi.hoisted(() => ({
  clear: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
const refresh = vi.fn();

vi.mock('@tuturuuu/internal-api/posts', () => ({
  clearUserGroupPostChecks: api.clear,
  createUserGroupPostCheck: api.create,
  updateUserGroupPostChecks: api.update,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@tuturuuu/users-ui/components/post-approval-actions', () => ({
  PostApprovalActions: ({
    approvalStatus,
    onStatusChange,
  }: {
    approvalStatus: string;
    onStatusChange?: (status: 'APPROVED' | 'PENDING' | 'REJECTED') => void;
  }) => (
    <div>
      <span>approval:{approvalStatus}</span>
      <button type="button" onClick={() => onStatusChange?.('APPROVED')}>
        approve-test
      </button>
    </div>
  ),
}));

const post = {
  group_id: '22222222-2222-4222-8222-222222222222',
  id: '33333333-3333-4333-8333-333333333333',
} as UserGroupPost;

function recipient(overrides: Partial<GroupPostRecipientRow> = {}) {
  return {
    approval_status: null,
    can_remove_approval: true,
    has_check: false,
    is_completed: null,
    recipient: 'Daily report recipient',
    review_stage: 'missing_check',
    user_id: '44444444-4444-4444-8444-444444444444',
    ...overrides,
  } as GroupPostRecipientRow;
}

function renderCard(value: GroupPostRecipientRow) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UserCard
        canApprovePosts
        canUpdateUserGroupsPosts
        post={post}
        recipient={value}
        wsId="11111111-1111-4111-8111-111111111111"
      />
    </QueryClientProvider>
  );
}

describe('daily report recipient marker state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.clear.mockResolvedValue({ message: 'cleared' });
    api.create.mockResolvedValue({ message: 'created' });
    api.update.mockResolvedValue({ message: 'updated' });
  });

  it('turns a missing check into a completed check without waiting for refresh', async () => {
    renderCard(recipient());

    fireEvent.click(screen.getByRole('button', { name: 'common.completed' }));

    await waitFor(() => expect(api.create).toHaveBeenCalledOnce());
    expect(screen.getByText('approval:PENDING')).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'ws_post_details.reset_check' })
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'common.incomplete' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledOnce());
  });

  it('removes the local check marker after reset', async () => {
    renderCard(
      recipient({
        approval_status: 'PENDING',
        has_check: true,
        is_completed: true,
        review_stage: 'pending_approval',
      })
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'ws_post_details.reset_check' })
    );

    await waitFor(() => expect(api.clear).toHaveBeenCalledOnce());
    expect(screen.queryByText('approval:PENDING')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'ws_post_details.reset_check' })
    ).toBeNull();
  });

  it('keeps the approval badge and action marker synchronized', () => {
    renderCard(
      recipient({
        approval_status: 'PENDING',
        has_check: true,
        is_completed: false,
        review_stage: 'pending_approval',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'approve-test' }));

    expect(screen.getByText('approval:APPROVED')).toBeDefined();
    expect(screen.getByText('approved')).toBeDefined();
  });
});
