import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ChatMessage } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatConversationThread } from './chat-conversation-thread';
import { MessageList, type MessageListProps } from './message-list';

const { mutateAsync, notifyUnavailable } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  notifyUnavailable: vi.fn(),
}));

vi.mock('./hooks-messages', () => ({
  useSendChatMessage: () => ({ isPending: false, mutateAsync }),
}));

vi.mock('../sonner', () => ({
  toast: { error: vi.fn(), info: notifyUnavailable },
}));

const messages = {
  chat: {
    assistant_name: 'Mira',
    attach_files: 'Attach files',
    attachment: 'Attachment',
    cancel_reply: 'Cancel reply',
    external_sender: 'External sender',
    jump_to_original_message: 'Jump to original message',
    load_older_messages: 'Load older messages',
    loading_older_messages: 'Loading older messages',
    message_deleted: 'Message deleted',
    message_placeholder: 'Write a message',
    message_send_failed: 'Could not send message',
    original_message_load_failed: 'Could not load the original message',
    original_message_unavailable: 'Original message unavailable',
    reply_to_message: 'Reply to message',
    replying_to: 'Replying to {sender}',
    send_message: 'Send message',
    unknown_sender: 'Unknown sender',
  },
};

function message(
  id: string,
  overrides: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    attachments: [],
    content: `Content of ${id}`,
    conversationId: '69ef23fa-f1f4-4377-b179-20a4cb039030',
    createdAt: '2026-11-20T10:00:00.000Z',
    deletedAt: null,
    editedAt: null,
    id,
    kind: 'user',
    metadata: {},
    reactions: [],
    replyToMessageId: null,
    sender: null,
    senderId: 'user-1',
    updatedAt: null,
    ...overrides,
  };
}

function renderChat(ui: ReactNode) {
  const queryClient = new QueryClient();
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    ),
  });
}

function renderThread(
  initialMessages: ChatMessage[],
  initialProps: Partial<MessageListProps> = {}
) {
  function thread(
    threadMessages: ChatMessage[],
    props: Partial<MessageListProps>
  ) {
    return (
      <MessageList
        currentUserId="user-2"
        messages={threadMessages}
        readOnly
        wsId="workspace-1"
        {...props}
      />
    );
  }

  const view = renderChat(thread(initialMessages, initialProps));
  return {
    rerender: (threadMessages: ChatMessage[], props = initialProps) =>
      view.rerender(thread(threadMessages, props)),
    unmount: view.unmount,
  };
}

function renderWritableThread(original: ChatMessage) {
  return renderChat(
    <ChatConversationThread
      conversationId={original.conversationId}
      currentUserId="user-2"
      isAgentReadOnly={false}
      isAiConversation={false}
      isTyping={false}
      isUploading={false}
      messages={[original]}
      onUploadFile={vi.fn()}
      wsId="workspace-1"
    />
  );
}

describe('Chat reply quotes', () => {
  const scrollToDescriptor = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'scrollTo'
  );

  beforeEach(() => {
    // jsdom does not lay out the viewport or dispatch native scroll events.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(320);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(320);
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(
      function (this: Element) {
        const spacer = this.firstElementChild;
        return spacer instanceof HTMLElement
          ? Number.parseFloat(spacer.style.height) || 320
          : 320;
      }
    );
    Object.defineProperty(Element.prototype, 'scrollTo', {
      configurable: true,
      value(this: Element, options: ScrollToOptions) {
        if (options.top === undefined || this.scrollTop === options.top) return;
        this.scrollTop = options.top;
        requestAnimationFrame(() => fireEvent.scroll(this));
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mutateAsync.mockReset();
    notifyUnavailable.mockReset();
    if (scrollToDescriptor) {
      Object.defineProperty(Element.prototype, 'scrollTo', scrollToDescriptor);
    } else {
      Reflect.deleteProperty(Element.prototype, 'scrollTo');
    }
  });

  it('scrolls to and focuses an original outside the rendered window', async () => {
    const original = message('original');
    const replies = Array.from({ length: 48 }, (_, i) => message(`row-${i}`));
    renderThread([
      original,
      ...replies,
      message('reply', { replyToMessageId: original.id }),
    ]);

    const quote = await screen.findByRole('button', {
      name: /Jump to original message.*Content of original/,
    });
    expect(screen.queryAllByText(original.content)).toHaveLength(1);

    fireEvent.click(quote);

    await waitFor(() => {
      expect(document.activeElement).toHaveTextContent(original.content);
      expect(document.activeElement).toHaveAttribute('data-chat-message');
    });
  });

  it('enables the jump once older history includes the original', () => {
    const original = message('original');
    const reply = message('reply', { replyToMessageId: original.id });
    const { rerender } = renderThread([reply]);

    expect(screen.getByText('Original message unavailable')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Jump to original/ })
    ).toBeNull();

    rerender([original, reply]);

    expect(
      screen.getByRole('button', { name: /Jump to original message/ })
    ).toBeVisible();
  });

  it('loads older pages and focuses the original after it renders', async () => {
    const original = message('original');
    const reply = message('reply', { replyToMessageId: original.id });
    const older = Array.from({ length: 40 }, (_, index) =>
      message(`older-${index}`)
    );
    const onLoadMoreMessages = vi
      .fn()
      .mockResolvedValueOnce({
        data: { pages: [{ messages: [reply] }, { messages: older }] },
        hasNextPage: true,
      })
      .mockResolvedValueOnce({
        data: {
          pages: [
            { messages: [reply] },
            { messages: older },
            { messages: [original] },
          ],
        },
        hasNextPage: false,
      });
    const { rerender } = renderThread([reply], {
      hasMoreMessages: true,
      onLoadMoreMessages,
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Jump to original message' })
    );
    await waitFor(() => expect(onLoadMoreMessages).toHaveBeenCalledTimes(2));
    rerender([original, ...older, reply], {
      hasMoreMessages: false,
      onLoadMoreMessages,
    });

    await waitFor(() => {
      expect(document.activeElement).toHaveTextContent(original.content);
      expect(document.activeElement).toHaveAttribute('data-chat-message');
    });
  });

  it('stops at exhausted history and ignores an original from another conversation', async () => {
    const reply = message('reply', { replyToMessageId: 'original' });
    const onLoadMoreMessages = vi.fn().mockResolvedValue({
      data: {
        pages: [
          { messages: [message('original', { conversationId: 'other' })] },
        ],
      },
      hasNextPage: false,
    });
    renderThread([reply], { hasMoreMessages: true, onLoadMoreMessages });

    fireEvent.click(
      screen.getByRole('button', { name: 'Jump to original message' })
    );

    await waitFor(() => expect(notifyUnavailable).toHaveBeenCalledOnce());
    expect(onLoadMoreMessages).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toHaveAttribute('data-chat-message');
  });

  it('bounds a history lookup when more pages are available', async () => {
    const reply = message('reply', { replyToMessageId: 'original' });
    const onLoadMoreMessages = vi.fn().mockResolvedValue({
      data: { pages: [{ messages: [reply] }] },
      hasNextPage: true,
    });
    renderThread([reply], { hasMoreMessages: true, onLoadMoreMessages });

    fireEvent.click(
      screen.getByRole('button', { name: 'Jump to original message' })
    );

    await waitFor(() => expect(notifyUnavailable).toHaveBeenCalledOnce());
    expect(onLoadMoreMessages).toHaveBeenCalledTimes(5);
  });

  it('stops paging if the thread is closed while a lookup is pending', async () => {
    const reply = message('reply', { replyToMessageId: 'original' });
    let resolvePage: (page: { hasNextPage: boolean }) => void = () => {};
    const pendingPage = new Promise<{ hasNextPage: boolean }>((resolve) => {
      resolvePage = resolve;
    });
    const onLoadMoreMessages = vi.fn(() => pendingPage);
    const { unmount } = renderThread([reply], {
      hasMoreMessages: true,
      onLoadMoreMessages,
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Jump to original message' })
    );
    unmount();
    await act(async () => resolvePage({ hasNextPage: true }));

    expect(onLoadMoreMessages).toHaveBeenCalledOnce();
    expect(notifyUnavailable).not.toHaveBeenCalled();
  });

  it('previews and submits a reply, keeping the quote and send identity on retry', async () => {
    const original = message('86caee82-51a5-489b-90e5-62c44745c4a6', {
      content: 'Original content',
    });
    mutateAsync
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({});
    renderWritableThread(original);

    fireEvent.click(screen.getByRole('button', { name: 'Reply to message' }));
    const input = screen.getByPlaceholderText('Write a message');
    expect(input).toHaveFocus();
    expect(screen.getByText('Replying to Unknown sender')).toBeVisible();
    expect(screen.getAllByText(original.content)).toHaveLength(2);
    fireEvent.change(input, { target: { value: 'A reply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(input).toHaveValue('A reply'));
    expect(screen.getByRole('button', { name: 'Cancel reply' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Cancel reply' })).toBeNull()
    );
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync.mock.calls[0]?.[0]).toEqual({
      attachments: [],
      clientRequestId: expect.any(String),
      content: 'A reply',
      replyToMessageId: original.id,
    });
    expect(mutateAsync.mock.calls[0]?.[0]).toEqual(
      mutateAsync.mock.calls[1]?.[0]
    );
    expect(input).toHaveValue('');
  });

  it('cancels the quote while keeping the draft available to send', async () => {
    const original = message('86caee82-51a5-489b-90e5-62c44745c4a6');
    mutateAsync.mockResolvedValueOnce({});
    renderWritableThread(original);

    fireEvent.click(screen.getByRole('button', { name: 'Reply to message' }));
    const input = screen.getByPlaceholderText('Write a message');
    fireEvent.change(input, { target: { value: 'Keep this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Keep this');
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
    expect(mutateAsync.mock.calls[0]?.[0]).not.toHaveProperty(
      'replyToMessageId'
    );
  });

  it('quotes only the tombstone when the original was deleted', () => {
    const original = message('original', {
      deletedAt: '2026-11-20T10:02:00.000Z',
    });
    renderThread([
      original,
      message('reply', { replyToMessageId: original.id }),
    ]);

    expect(
      screen.getByRole('button', { name: /Jump to original.*Message deleted/ })
    ).toBeVisible();
    expect(screen.queryByText(original.content)).toBeNull();
  });
});
