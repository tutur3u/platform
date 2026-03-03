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
    const getUploadedAttachmentMetadata = vi.fn(() => []);

    const { result, rerender } = renderHook(
      ({ status }: { status: string }) =>
        useMiraMessageQueue({
          attachedFilesRef: { current: [] },
          chatId: 'chat-1',
          clearAttachedFiles,
          createChat,
          getUploadedAttachmentMetadata,
          messages: [],
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
        id: expect.any(String),
        role: 'user',
        parts: [{ type: 'text', text: 'hello?' }],
      })
    );
    expect(clearAttachedFiles).not.toHaveBeenCalled();
  });

  it('binds uploaded attachments to the exact outgoing user message id', async () => {
    const sendMessageWithCurrentConfig = vi.fn<(message: UIMessage) => void>();
    const snapshotAttachmentsForMessage = vi.fn();
    const clearAttachedFiles = vi.fn();
    const createChat = vi.fn(async () => {});
    const getUploadedAttachmentMetadata = vi.fn(() => [
      {
        name: 'note.wav',
        size: 5,
        storagePath: 'ws/chat/audio.wav',
        type: 'audio/wav',
      },
    ]);
    const attachedFiles = [
      {
        id: 'file-1',
        file: new File(['audio'], 'note.wav', { type: 'audio/wav' }),
        previewUrl: 'blob:preview',
        signedUrl: 'https://example.com/audio.wav',
        status: 'uploaded' as const,
        storagePath: 'ws/chat/audio.wav',
      },
    ];

    const { result } = renderHook(() =>
      useMiraMessageQueue({
        attachedFilesRef: { current: attachedFiles },
        chatId: 'chat-1',
        clearAttachedFiles,
        createChat,
        getUploadedAttachmentMetadata,
        messages: [],
        sendMessageWithCurrentConfig,
        snapshotAttachmentsForMessage,
        status: 'ready',
      })
    );

    act(() => {
      result.current.handleSubmit('');
    });

    await waitFor(() => {
      expect(sendMessageWithCurrentConfig).toHaveBeenCalledTimes(1);
    });

    const sentMessage = sendMessageWithCurrentConfig.mock.calls[0]?.[0];
    expect(sentMessage?.id).toBeTruthy();
    expect(snapshotAttachmentsForMessage).toHaveBeenCalledWith('queued');
    expect(snapshotAttachmentsForMessage).toHaveBeenCalledWith(sentMessage?.id);
    expect(snapshotAttachmentsForMessage).not.toHaveBeenCalledWith(
      '__latest_user_upload'
    );
    expect(
      snapshotAttachmentsForMessage.mock.invocationCallOrder[1]
    ).toBeLessThan(clearAttachedFiles.mock.invocationCallOrder[0] ?? Infinity);
    expect(sentMessage).toEqual(
      expect.objectContaining({
        metadata: {
          attachments: [
            {
              name: 'note.wav',
              size: 5,
              storagePath: 'ws/chat/audio.wav',
              type: 'audio/wav',
            },
          ],
        },
        role: 'user',
        parts: [{ type: 'text', text: 'Please analyze the attached file(s).' }],
      })
    );
    expect(clearAttachedFiles).toHaveBeenCalledTimes(1);
  });

  it('waits for the real chat id before sending the first optimistic message', async () => {
    const sendMessageWithCurrentConfig = vi.fn<(message: UIMessage) => void>();
    const snapshotAttachmentsForMessage = vi.fn();
    const clearAttachedFiles = vi.fn();
    const createChat = vi.fn(async () => {});
    const getUploadedAttachmentMetadata = vi.fn(() => []);

    const { result, rerender } = renderHook<
      ReturnType<typeof useMiraMessageQueue>,
      { chatId?: string; messages: UIMessage[] }
    >(
      ({ chatId, messages }) =>
        useMiraMessageQueue({
          attachedFilesRef: { current: [] },
          chatId,
          clearAttachedFiles,
          createChat,
          getUploadedAttachmentMetadata,
          messages,
          sendMessageWithCurrentConfig,
          snapshotAttachmentsForMessage,
          status: 'ready',
        }),
      {
        initialProps: {
          chatId: undefined,
          messages: [],
        },
      }
    );

    act(() => {
      result.current.handleSubmit('first message');
    });

    await waitFor(() => {
      expect(createChat).toHaveBeenCalledTimes(1);
    });

    expect(sendMessageWithCurrentConfig).not.toHaveBeenCalled();
    expect(result.current.optimisticPendingMessage).toEqual(
      expect.objectContaining({
        role: 'user',
        parts: [{ type: 'text', text: 'first message' }],
      })
    );

    rerender({
      chatId: 'chat-1',
      messages: [],
    });

    await waitFor(() => {
      expect(sendMessageWithCurrentConfig).toHaveBeenCalledTimes(1);
    });

    const sentMessage = sendMessageWithCurrentConfig.mock.calls[0]?.[0] as
      | UIMessage
      | undefined;
    expect(sentMessage?.id).toBe(result.current.optimisticPendingMessage?.id);

    rerender({
      chatId: 'chat-1',
      messages: sentMessage ? [sentMessage] : [],
    });

    await waitFor(() => {
      expect(result.current.optimisticPendingMessage).toBeNull();
    });
  });
});
