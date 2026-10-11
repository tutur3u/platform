import { act, renderHook, waitFor } from '@testing-library/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { describe, expect, it, vi } from 'vitest';
import { useMiraMessageQueue } from '../use-mira-message-queue';

describe('useMiraMessageQueue', () => {
  it('preserves a queued prompt when the model disconnects before the debounce flush', async () => {
    vi.useFakeTimers();
    try {
      const createChat = vi.fn(
        async (_prompt: string, _current?: () => boolean) => {}
      );
      const clearAttachedFiles = vi.fn();
      const { result, rerender } = renderHook(
        ({ disabled }) =>
          useMiraMessageQueue({
            disabled,
            attachedFiles: [],
            createChat,
            clearAttachedFiles,
            sendMessageWithCurrentConfig: vi.fn(),
            snapshotAttachmentsForMessage: vi.fn(),
            status: 'ready',
          }),
        { initialProps: { disabled: false } }
      );
      act(() => result.current.handleSubmit('Keep this prompt'));
      rerender({ disabled: true });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(createChat).not.toHaveBeenCalled();
      expect(clearAttachedFiles).not.toHaveBeenCalled();
      expect(result.current.queuedText).toBe('Keep this prompt');
      await act(async () => rerender({ disabled: false }));
      expect(createChat).toHaveBeenCalledExactlyOnceWith(
        'Keep this prompt',
        expect.any(Function),
        expect.any(Function)
      );
      const current = createChat.mock.calls[0]?.[1];
      expect(current?.()).toBe(true);
      expect(clearAttachedFiles).toHaveBeenCalledOnce();
      expect(result.current.queuedText).toBeNull();
      await act(async () => rerender({ disabled: false }));
      expect(createChat).toHaveBeenCalledOnce();
      act(() => result.current.resetQueue());
      expect(current?.()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it('waits for the chat to leave submitted before flushing a queued retry', async () => {
    const sendMessageWithCurrentConfig = vi.fn<(message: UIMessage) => void>();
    const stop = vi.fn();
    const snapshotAttachmentsForMessage = vi.fn();
    const clearAttachedFiles = vi.fn();
    const createChat = vi.fn(async () => {});

    const { result, rerender } = renderHook(
      ({ status }: { status: string }) =>
        useMiraMessageQueue({
          attachedFiles: [],
          chatId: 'chat-1',
          clearAttachedFiles,
          createChat,
          sendMessageWithCurrentConfig,
          snapshotAttachmentsForMessage,
          status,
          stop,
        }),
      {
        initialProps: { status: 'submitted' },
      }
    );

    act(() => {
      result.current.handleSubmit('hello?');
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(sendMessageWithCurrentConfig).not.toHaveBeenCalled();
    expect(result.current.queuedText).toBe('hello?');

    rerender({ status: 'ready' });

    await waitFor(() => {
      expect(sendMessageWithCurrentConfig).toHaveBeenCalledTimes(1);
    });

    expect(sendMessageWithCurrentConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'hello?' }],
      })
    );
    expect(clearAttachedFiles).toHaveBeenCalledTimes(1);
  });
});
