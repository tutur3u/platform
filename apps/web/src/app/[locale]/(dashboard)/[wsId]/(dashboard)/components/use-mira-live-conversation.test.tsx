import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useMiraLiveConversation } from './use-mira-live-conversation';

const save = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/ai', () => ({ saveLiveConversation: save }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
beforeEach(() => {
  save.mockReset().mockResolvedValue({ id: 'chat' });
});
function setup() {
  let messages: UIMessage[] = [
    {
      id: 'earlier',
      role: 'user',
      parts: [{ type: 'text', text: 'Earlier typed message' }],
    },
  ];
  const onSaved = vi.fn();
  const onStarted = vi.fn();
  const client = new QueryClient();
  const hook = renderHook(
    ({ chatId }) =>
      useMiraLiveConversation({
        chatId,
        setMessages: (update) => {
          messages = update(messages);
        },
        onSaved,
        onStarted,
      }),
    {
      initialProps: { chatId: 'chat' },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  );
  return { ...hook, onSaved, onStarted, messages: () => messages };
}
const spoken = {
  id: 'spoken',
  role: 'assistant' as const,
  parts: [{ type: 'text' as const, text: 'Hello' }],
  complete: false,
};
it('updates speech in the existing timeline and persists finalized turns without duplicates', async () => {
  const { result, messages, onSaved } = setup();
  act(() => result.current.onChange([spoken], false));
  expect(messages().map((message) => message.id)).toEqual([
    'earlier',
    'spoken',
  ]);
  expect(save).not.toHaveBeenCalled();
  await act(async () => {
    result.current.onChange([{ ...spoken, complete: true }], true);
    await result.current.flush();
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(onSaved).toHaveBeenCalledWith('chat');
  await act(async () => {
    result.current.onChange([{ ...spoken, complete: true }], true);
    await result.current.flush();
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(messages()).toHaveLength(2);
});
it('waits for the outstanding save before allowing the next typed turn', async () => {
  let finish!: () => void;
  save.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  const { result } = setup();
  let flushed = false;
  let waiting!: Promise<void>;
  await act(async () => {
    result.current.onChange([{ ...spoken, complete: true }], true);
    waiting = result.current.flush().then(() => {
      flushed = true;
    });
  });
  expect(flushed).toBe(false);
  await act(async () => {
    finish();
    await waiting;
  });
  expect(flushed).toBe(true);
});
it('does not append an old session callback into a different chat', () => {
  const { result, rerender, messages } = setup();
  const previous = result.current.onChange;
  rerender({ chatId: 'new-chat' });
  act(() => previous([spoken], false));
  expect(messages()).toHaveLength(1);
});
