// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMailSenderBlockMutations } from './use-mail-sender-blocks';
import { useProfileBlockAction } from './use-profile-block-action';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  addMailSenderBlock: mocks.add,
  removeMailSenderBlock: mocks.remove,
  listMailSenderBlocks: vi.fn(),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: mocks }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./use-mail-bootstrap', () => ({ useMailBootstrap: vi.fn() }));
vi.mock('./mail-people-resolver', () => ({
  mailPersonQueryKey: (workspace: string, address: string) => [
    'person',
    workspace,
    address,
  ],
}));

const block = {
  id: 'synthetic-block',
  kind: 'address' as const,
  value: 'sender@example.test',
  createdAt: '2026-01-01T00:00:00Z',
  createdBy: 'synthetic-actor',
};
let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
});
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  mocks.add.mockResolvedValue({ block, moved: 1 });
  mocks.remove.mockResolvedValue({ moved: 1 });
});

function mount() {
  let unread = 1;
  const count = vi.fn(async () => unread);
  const mail = vi.fn(async () => ['synthetic-thread']);
  const hook = renderHook(
    () => ({
      bell: useQuery({
        queryKey: ['notifications', 'count', 'synthetic-actor'],
        queryFn: count,
      }),
      mail: useQuery({
        queryKey: ['mail', 'synthetic-ws', 'synthetic-box', 'threads'],
        queryFn: mail,
      }),
      sender: useMailSenderBlockMutations('synthetic-ws', 'synthetic-box'),
      profile: useProfileBlockAction(
        'synthetic-ws',
        'synthetic-box',
        block.value
      ),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    }
  );
  return {
    ...hook,
    count,
    mail,
    consume: () => {
      unread = 0;
    },
  };
}

describe('block notification reconciliation', () => {
  it.each([false, true])(
    'refreshes the bell after a block, partial failure=%s',
    async (fails) => {
      const hook = mount();
      await waitFor(() => expect(hook.result.current.bell.data).toBe(1));
      mocks.add.mockImplementation(async () => {
        hook.consume();
        if (fails) throw new Error('synthetic later chunk failure');
        return { block, moved: 1 };
      });
      await act(async () => {
        await hook.result.current.sender.add
          .mutateAsync(block)
          .catch(() => undefined);
      });
      await waitFor(() => expect(hook.result.current.bell.data).toBe(0));
      expect(hook.count).toHaveBeenCalledTimes(2);
      if (fails) expect(mocks.error).toHaveBeenCalledWith('save_failed');
    }
  );

  it('reconciles profile block and toast Undo', async () => {
    const hook = mount();
    await waitFor(() => expect(hook.result.current.bell.data).toBe(1));
    hook.consume();
    await act(async () => {
      await hook.result.current.profile.mutateAsync({
        ...block,
        moveExisting: true,
      });
    });
    await waitFor(() => expect(hook.result.current.bell.data).toBe(0));
    const options = mocks.success.mock.calls[0]?.[1];
    act(() => options.action.onClick());
    await waitFor(() => expect(hook.count).toHaveBeenCalledTimes(3));
    expect(mocks.remove).toHaveBeenCalledWith(
      'synthetic-ws',
      'synthetic-box',
      block.id,
      { restoreToInbox: true }
    );
  });

  it('reconciles remove failures and keeps notification reads independent of Mail', async () => {
    const hook = mount();
    await waitFor(() => expect(hook.result.current.bell.data).toBe(1));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['notifications'] });
    });
    expect(hook.mail).toHaveBeenCalledTimes(1);
    mocks.remove.mockRejectedValue(new Error('synthetic remove failure'));
    hook.consume();
    await act(async () => {
      await hook.result.current.sender.remove
        .mutateAsync({ block, restoreToInbox: true })
        .catch(() => undefined);
    });
    await waitFor(() => expect(hook.result.current.bell.data).toBe(0));
    expect(mocks.error).toHaveBeenCalledWith('save_failed');
  });
});
