// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import type { ComponentProps, ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { MiraChatConversation } from './mira-chat-conversation';

vi.mock('@json-render/react', () => ({
  StateProvider: ({ children }: { children: ReactNode }) => children,
  ActionProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./use-chat-scroll-follow', () => ({ useChatScrollFollow: () => {} }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./chat-message-list/markdown-components', () => ({
  AssistantMarkdown: ({ text }: { text: string }) => <span>{text}</span>,
  ReasoningPart: () => null,
}));
vi.mock('./chat-message-list/tool-components', () => ({
  CopyButton: () => null,
}));

const pending: UIMessage = {
  id: 'send-1',
  role: 'user',
  parts: [{ type: 'text', text: 'Hello Mira' }],
};
function props(): ComponentProps<typeof MiraChatConversation> {
  return {
    actionHandlers: {} as ComponentProps<
      typeof MiraChatConversation
    >['actionHandlers'],
    generativeUIStore: {} as ComponentProps<
      typeof MiraChatConversation
    >['generativeUIStore'],
    assistantName: 'Mira',
    hasFileOnlyPending: false,
    isBusy: false,
    messageAttachments: new Map(),
    messages: [],
    onAutoSubmitMermaidFix: () => {},
    pendingDisplay: 'Hello Mira',
    pendingPrompt: null,
    queuedText: null,
    dispatchPending: pending,
    scrollContainerRef: { current: null },
  };
}
it('shows activity during dispatch, reconciles the SDK user once, and hides activity on first text', () => {
  const onActivityVisible = vi.fn();
  const initial = { ...props(), onActivityVisible };
  const view = render(<MiraChatConversation {...initial} />);
  expect(screen.getAllByText('Hello Mira')).toHaveLength(1);
  expect(screen.getByText('response_status_starting')).toBeVisible();
  expect(onActivityVisible).toHaveBeenCalledOnce();
  view.rerender(
    <MiraChatConversation {...initial} messages={[pending]} isBusy />
  );
  expect(screen.getAllByText('Hello Mira')).toHaveLength(1);
  view.rerender(
    <MiraChatConversation
      {...initial}
      messages={[
        pending,
        {
          id: 'answer',
          role: 'assistant',
          parts: [{ type: 'text', text: 'First answer' }],
        },
      ]}
      isBusy
    />
  );
  expect(screen.getByText('First answer')).toBeVisible();
  expect(
    screen.queryByText('response_status_starting')
  ).not.toBeInTheDocument();
});
it('shows queued and creation activity before the SDK starts', () => {
  const onActivityVisible = vi.fn();
  render(
    <MiraChatConversation
      {...props()}
      dispatchPending={null}
      queuedText="Hello Mira"
      onActivityVisible={onActivityVisible}
    />
  );
  expect(screen.getAllByText('Hello Mira')).toHaveLength(1);
  expect(screen.getByText('response_status_starting')).toBeVisible();
  expect(onActivityVisible).toHaveBeenCalledOnce();
});
