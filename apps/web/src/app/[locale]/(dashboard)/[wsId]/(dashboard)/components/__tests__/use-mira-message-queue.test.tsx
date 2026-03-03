import { act, renderHook, waitFor } from '@testing-library/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { describe, expect, it, vi } from 'vitest';
import { useMiraMessageQueue } from '../use-mira-message-queue';

describe('useMiraMessageQueue', () => {
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
