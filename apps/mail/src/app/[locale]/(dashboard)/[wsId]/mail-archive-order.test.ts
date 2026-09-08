import type { MailThreadSummary } from '@tuturuuu/internal-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selected: { current: 'a' as string | null },
  mutations: [] as Array<{
    options: { mutationKey: string[]; [key: string]: any };
    mutate: ReturnType<typeof vi.fn>;
  }>,
  reopen: vi.fn(),
  client: {
    cancelQueries: vi.fn().mockResolvedValue(undefined),
    getQueriesData: vi.fn().mockReturnValue([]),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.client,
  useMutation: (options: { mutationKey: string[]; [key: string]: any }) => {
    const mutation = { options, mutate: vi.fn() };
    mocks.mutations.push(mutation);
    return mutation;
  },
}));
vi.mock('react', () => ({
  useRef: () => mocks.selected,
  useState: () => ['idle', vi.fn()],
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));

import { useMailThreadActions } from './use-mail-thread-actions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutations.length = 0;
  mocks.selected.current = 'a';
  useMailThreadActions({
    activeMailboxId: 'mailbox',
    closeThread: vi.fn(),
    folder: 'inbox',
    invalidateMailbox: vi.fn().mockResolvedValue(undefined),
    reopenThread: mocks.reopen,
    selectedThreads: new Set(['a']),
    setSelectedThreads: vi.fn(),
    threadId: 'a',
    threads: [
      { id: 'a', unreadCount: 0 },
      { id: 'b', unreadCount: 1 },
    ] as MailThreadSummary[],
    workspaceId: 'ws',
  });
});

describe('archive and auto-read ordering', () => {
  it.each([false, true])(
    'waits for archive success before reading the next message (bulk=%s)',
    async (bulk) => {
      const autoRead = mocks.mutations.find(
        (entry) => entry.options.mutationKey.at(-1) === 'auto-read'
      )!;
      const archive = mocks.mutations.find(
        (entry) =>
          entry.options.mutationKey.at(-1) === (bulk ? 'bulk' : 'state')
      )!;
      const variables = bulk
        ? 'archive'
        : { action: 'archive', targetThreadId: 'a' };
      const context = await archive.options.onMutate!(variables);
      expect(mocks.reopen).toHaveBeenCalledWith('b');
      expect(autoRead.mutate).not.toHaveBeenCalled();
      // A fast response can arrive before navigation renders.
      expect(mocks.selected.current).toBe('a');
      archive.options.onSuccess!({}, variables, context);
      expect(autoRead.mutate).toHaveBeenCalledWith('b');
    }
  );
  it('restores a failed archive without starting another optimistic read mutation', async () => {
    const archive = mocks.mutations.find(
      (entry) => entry.options.mutationKey.at(-1) === 'state'
    )!;
    const variables = { action: 'archive', targetThreadId: 'a' };
    const context = await archive.options.onMutate!(variables);
    mocks.selected.current = 'b';
    archive.options.onError!(new Error('failed'), variables, context);
    expect(mocks.reopen).toHaveBeenLastCalledWith('a');
    expect(
      mocks.mutations.find(
        (entry) => entry.options.mutationKey.at(-1) === 'auto-read'
      )!.mutate
    ).not.toHaveBeenCalled();
  });
});
