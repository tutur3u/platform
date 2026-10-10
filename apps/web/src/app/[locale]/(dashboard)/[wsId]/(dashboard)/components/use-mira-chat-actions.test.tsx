import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { AIModelUI } from '@tuturuuu/types';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY_PREFIX } from './mira-chat-constants';
import { useMiraChatActions } from './use-mira-chat-actions';

const mocks = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: mocks.toast } }));
vi.mock('@tuturuuu/internal-api/chatgpt', () => ({
  createChatGPTChat: vi.fn(),
}));
vi.mock('@/components/json-render/generative-ui-store', () => ({
  resetGenerativeUIStore: vi.fn(),
}));
vi.mock('./mira-chat-export', () => ({ exportMiraChat: vi.fn() }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const params: Parameters<typeof useMiraChatActions>[0] = {
    wsId: 'workspace',
    chatId: 'old',
    fallbackChatId: 'new',
    stableChatId: 'new',
    gatewayModelId: 'google/model',
    model: { disabled: false } as AIModelUI,
    status: 'ready',
    thinkingMode: 'fast',
    messages: [],
    messageAttachments: new Map(),
    clearAttachedFiles: vi.fn(),
    cleanupPendingUploads: vi.fn().mockResolvedValue(undefined),
    sendMessageWithCurrentConfig: vi.fn().mockResolvedValue(true),
    setChat: vi.fn(),
    setFallbackChatId: vi.fn(),
    setInput: vi.fn(),
    setMessageAttachments: vi.fn(),
    setPendingPrompt: vi.fn(),
    setStoredChatId: vi.fn(),
    setWorkspaceContextId: vi.fn(),
    t: (key: string) => key,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    params,
    client,
    ...renderHook((props) => useMiraChatActions(props), {
      initialProps: params,
      wrapper,
    }),
  };
}
describe('Mira create response continuation admission', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => vi.unstubAllGlobals());
  for (const boundary of ['reset', 'unmount', 'external lease', 'workspace']) {
    it(`late create after ${boundary} cannot publish chat, storage or send`, async () => {
      const held = deferred<Response>();
      const fetcher = vi.fn(() => held.promise);
      vi.stubGlobal('fetch', fetcher);
      const f = fixture();
      let current = true;
      const onCreated = vi.fn();
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = f.result.current.createChat(
          'hello',
          () => current,
          onCreated
        );
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      if (boundary === 'reset')
        await act(async () => {
          await f.result.current.resetConversationState();
        });
      else if (boundary === 'unmount') f.unmount();
      else if (boundary === 'workspace')
        f.rerender({ ...f.params, wsId: 'other' });
      else current = false;
      vi.mocked(f.params.setChat).mockClear();
      vi.mocked(f.params.setStoredChatId).mockClear();
      await act(async () => {
        held.resolve(Response.json({ id: 'created' }));
        await pending;
      });
      expect(onCreated).not.toHaveBeenCalled();
      expect(f.params.setChat).not.toHaveBeenCalled();
      expect(f.params.setStoredChatId).not.toHaveBeenCalled();
      expect(localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace`)).toBeNull();
      expect(f.params.sendMessageWithCurrentConfig).not.toHaveBeenCalled();
      f.client.clear();
    });
  }
  it('a current successful create publishes and sends exactly once', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ id: 'created' }))
    );
    const f = fixture();
    await act(async () => {
      await f.result.current.createChat(
        'hello',
        () => true,
        (id) => {
          expect(f.params.setChat).not.toHaveBeenCalled();
          expect(id).toBe('created');
        }
      );
    });
    expect(f.params.setStoredChatId).toHaveBeenCalledWith('created');
    expect(localStorage.getItem(`${STORAGE_KEY_PREFIX}workspace`)).toBe(
      'created'
    );
    expect(f.params.sendMessageWithCurrentConfig).toHaveBeenCalledTimes(1);
    f.client.clear();
  });
  it('a late failed create reports no stale toast or pending-state changes', async () => {
    const held = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => held.promise)
    );
    const f = fixture();
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = f.result.current.createChat('hello');
    });
    f.unmount();
    vi.mocked(f.params.setPendingPrompt).mockClear();
    await act(async () => {
      held.resolve(new Response('', { status: 500 }));
      await pending;
    });
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(f.params.setPendingPrompt).not.toHaveBeenCalled();
    f.client.clear();
  });
});
