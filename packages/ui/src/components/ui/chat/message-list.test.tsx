import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChatMessage } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageList } from './message-list';

function message(
  id: string,
  overrides: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    attachments: [],
    content: `Content of ${id}`,
    conversationId: 'conversation-1',
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

function renderThread(initialMessages: ChatMessage[]) {
  function thread(messages: ChatMessage[]) {
    return (
      <NextIntlClientProvider
        locale="en"
        messages={{
          chat: {
            assistant_name: 'Mira',
            attachment: 'Attachment',
            external_sender: 'External sender',
            jump_to_original_message: 'Jump to original message',
            message_deleted: 'Message deleted',
            original_message_unavailable: 'Original message unavailable',
            unknown_sender: 'Unknown sender',
          },
        }}
        timeZone="UTC"
      >
        <MessageList
          currentUserId="user-2"
          messages={messages}
          readOnly
          wsId="workspace-1"
        />
      </NextIntlClientProvider>
    );
  }

  const { rerender } = render(thread(initialMessages));
  return (messages: ChatMessage[]) => rerender(thread(messages));
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
    const rerender = renderThread([reply]);

    expect(screen.getByText('Original message unavailable')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Jump to original/ })
    ).toBeNull();

    rerender([original, reply]);

    expect(
      screen.getByRole('button', { name: /Jump to original message/ })
    ).toBeVisible();
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
