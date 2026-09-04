/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostApprovalActions } from './post-approval-actions';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: mocks.toastSuccess },
}));

function renderActions(
  node: ReactNode,
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    ),
  };
}

describe('PostApprovalActions marker state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        })
      )
    );
  });

  it('immediately replaces approve with unapprove after a successful approval', async () => {
    const onStatusChange = vi.fn();
    renderActions(
      <PostApprovalActions
        approvalStatus="PENDING"
        itemId="post-1:user-1"
        onStatusChange={onStatusChange}
        wsId="workspace-1"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'actions.approve' }));

    await screen.findByRole('button', { name: 'actions.unapprove' });
    expect(
      screen.queryByRole('button', { name: 'actions.approve' })
    ).toBeNull();
    expect(onStatusChange).toHaveBeenCalledWith('APPROVED');
  });

  it('immediately reflects reject and unapprove transitions', async () => {
    const onStatusChange = vi.fn();
    renderActions(
      <PostApprovalActions
        approvalStatus="PENDING"
        itemId="post-1:user-1"
        onStatusChange={onStatusChange}
        wsId="workspace-1"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'actions.reject' }));
    fireEvent.change(screen.getByLabelText('labels.rejection_reason'), {
      target: { value: 'Needs another revision' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'actions.reject' }).at(-1)!
    );

    await waitFor(() =>
      expect(onStatusChange).toHaveBeenLastCalledWith('REJECTED')
    );
    expect(screen.queryByRole('button', { name: 'actions.reject' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'actions.approve' })
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'actions.approve' }));
    await screen.findByRole('button', { name: 'actions.unapprove' });
    fireEvent.click(screen.getByRole('button', { name: 'actions.unapprove' }));

    await waitFor(() =>
      expect(onStatusChange).toHaveBeenLastCalledWith('PENDING')
    );
    expect(
      screen.getByRole('button', { name: 'actions.approve' })
    ).toBeDefined();
  });

  it('reconciles its marker when refreshed server props change', async () => {
    const { rerender, client } = renderActions(
      <PostApprovalActions
        approvalStatus="PENDING"
        canRemoveApproval
        itemId="post-1:user-1"
        wsId="workspace-1"
      />
    );

    rerender(
      <QueryClientProvider client={client}>
        <PostApprovalActions
          approvalStatus="APPROVED"
          canRemoveApproval
          itemId="post-1:user-1"
          wsId="workspace-1"
        />
      </QueryClientProvider>
    );

    await screen.findByRole('button', { name: 'actions.unapprove' });
  });
});
