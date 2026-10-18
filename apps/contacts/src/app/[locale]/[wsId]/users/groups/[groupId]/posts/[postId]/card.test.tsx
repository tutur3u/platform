/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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

function renderCard(value: GroupPostRecipientRow, postValue = post) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UserCard
        canApprovePosts
        canUpdateUserGroupsPosts
        post={postValue}
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
  it('saves the current note draft and keeps it after submission', async () => {
    const savedRecipient = recipient({
      has_check: true,
      is_completed: true,
      notes: 'Old comment',
    });
    const rendered = renderCard(savedRecipient);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'New daily comment' },
    });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        expect.any(String),
        post.group_id,
        post.id,
        {
          user_id: savedRecipient.user_id,
          is_completed: true,
          notes: 'New daily comment',
        }
      )
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'New daily comment'
    );
    rendered.unmount();
    renderCard({ ...savedRecipient, notes: 'New daily comment' });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'New daily comment'
    );
  });

  it('keeps a rejected note draft and never resends notes with status changes', async () => {
    api.update.mockRejectedValueOnce(new Error('Invalid payload'));
    renderCard(
      recipient({
        has_check: true,
        is_completed: false,
        notes: 'Stored comment',
      })
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Unsaved comment' },
    });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await waitFor(() => expect(api.update).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'common.save' })
          .hasAttribute('disabled')
      ).toBe(false)
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Unsaved comment'
    );
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'common.completed' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    expect(api.update.mock.calls[1]?.[3]).toEqual({
      user_id: recipient().user_id,
      is_completed: true,
    });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Unsaved comment'
    );
  });

  it('resets the draft when the same recipient opens a different post', () => {
    const client = new QueryClient();
    const value = recipient({ has_check: true, notes: 'First post comment' });
    const renderValue = (postValue: UserGroupPost, notes: string) => (
      <QueryClientProvider client={client}>
        <UserCard
          canUpdateUserGroupsPosts
          post={postValue}
          recipient={{ ...value, notes }}
          wsId="workspace"
        />
      </QueryClientProvider>
    );
    const rendered = render(renderValue(post, 'First post comment'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Unsent first draft' },
    });
    rendered.rerender(
      renderValue({ ...post, id: 'different-post' }, 'Second post comment')
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Second post comment'
    );
  });

  it('preserves an edit back to the original text while an older save is pending', async () => {
    let finishSave: (() => void) | undefined;
    api.update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
    );
    const client = new QueryClient();
    const value = recipient({ has_check: true, notes: 'A' });
    const renderValue = (notes: string) => (
      <QueryClientProvider client={client}>
        <UserCard
          canUpdateUserGroupsPosts
          post={post}
          recipient={{ ...value, notes }}
          wsId="workspace"
        />
      </QueryClientProvider>
    );
    const rendered = render(renderValue('A'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'B' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await waitFor(() => expect(api.update).toHaveBeenCalledOnce());
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A' } });
    await act(async () => {
      finishSave?.();
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    rendered.rerender(renderValue('B'));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'A'
    );
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    expect(api.update.mock.calls[1]?.[3]).toEqual({
      user_id: value.user_id,
      is_completed: false,
      notes: 'A',
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    rendered.rerender(renderValue('A'));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'A'
    );
    rendered.unmount();
    renderCard({ ...value, notes: 'A' });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'A'
    );
  });

  it('accepts refreshed notes only after the latest local revision is saved', async () => {
    const client = new QueryClient();
    const value = recipient({ has_check: true, notes: 'A' });
    const renderValue = (notes: string) => (
      <QueryClientProvider client={client}>
        <UserCard
          canUpdateUserGroupsPosts
          post={post}
          recipient={{ ...value, notes }}
          wsId="workspace"
        />
      </QueryClientProvider>
    );
    const rendered = render(renderValue('A'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'B' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A' } });
    rendered.rerender(renderValue('Other device comment'));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'A'
    );
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    rendered.rerender(renderValue('Saved on another device'));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Saved on another device'
    );
  });

  it('disables note editing and saving while a reset is awaiting acknowledgement', async () => {
    let finishReset: (() => void) | undefined;
    api.clear.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishReset = resolve;
        })
    );
    renderCard(recipient({ has_check: true, notes: 'Stored comment' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'ws_post_details.reset_check' })
    );
    await waitFor(() => expect(api.clear).toHaveBeenCalledOnce());
    expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true);
    expect(
      screen
        .getByRole('button', { name: 'common.save' })
        .hasAttribute('disabled')
    ).toBe(true);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Stored comment'
    );
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      finishReset?.();
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true);
  });

  it('retains a dirty draft when a refreshed recipient has newer server notes', () => {
    const client = new QueryClient();
    const value = recipient({ has_check: true, notes: 'Original' });
    const renderValue = (notes: string) => (
      <QueryClientProvider client={client}>
        <UserCard
          canUpdateUserGroupsPosts
          post={post}
          recipient={{ ...value, notes }}
          wsId="workspace"
        />
      </QueryClientProvider>
    );
    const rendered = render(renderValue('Original'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Local edit' },
    });
    rendered.rerender(renderValue('Other device comment'));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Local edit'
    );
  });
  it('preserves stored and unsaved notes when a reset fails', async () => {
    api.clear.mockRejectedValueOnce(new Error('Synthetic reset rejection'));
    renderCard(
      recipient({
        has_check: true,
        is_completed: true,
        notes: 'Stored comment',
      })
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Unsaved comment' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'ws_post_details.reset_check' })
    );
    await waitFor(() => expect(api.clear).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(false)
    );
    expect(screen.getByRole('textbox')).toHaveProperty(
      'value',
      'Unsaved comment'
    );
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await waitFor(() => expect(api.update).toHaveBeenCalledOnce());
    expect(api.update.mock.calls[0]?.[3]).toEqual({
      user_id: recipient().user_id,
      is_completed: true,
      notes: 'Unsaved comment',
    });
  });

  it('honors explicit empty remarks and reloads the cleared value', async () => {
    const value = recipient({
      has_check: true,
      is_completed: true,
      notes: 'Stored comment',
    });
    const rendered = renderCard(value);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(api.update.mock.calls[0]?.[3]).toEqual({
      user_id: value.user_id,
      is_completed: true,
      notes: '',
    });
    expect(screen.getByRole('textbox')).toHaveProperty('value', '');
    rendered.unmount();
    renderCard({ ...value, notes: '' });
    expect(screen.getByRole('textbox')).toHaveProperty('value', '');
  });

  it('keeps a later remark typed while an earlier submission is in flight', async () => {
    let finishSave: (() => void) | undefined;
    api.update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
    );
    renderCard(
      recipient({
        has_check: true,
        is_completed: true,
        notes: 'Stored comment',
      })
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'First submitted remark' },
    });
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await waitFor(() => expect(api.update).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Later unsaved remark' },
    });
    await act(async () => finishSave?.());
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByRole('textbox')).toHaveProperty(
      'value',
      'Later unsaved remark'
    );
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
    expect(api.update.mock.calls[1]?.[3]).toMatchObject({
      notes: 'Later unsaved remark',
    });
  });
});
