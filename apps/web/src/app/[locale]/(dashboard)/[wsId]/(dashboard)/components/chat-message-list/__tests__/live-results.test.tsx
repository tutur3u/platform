import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ChatMessageList from '../../chat-message-list';

vi.mock('../../use-chat-scroll-follow', () => ({
  useChatScrollFollow: () => {},
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../markdown-components', () => ({
  AssistantMarkdown: ({ content }: { content: string }) => (
    <span>{content}</span>
  ),
  ReasoningPart: () => null,
}));
vi.mock('../tool-components', () => ({ CopyButton: () => null }));

it('renders shared Live results once after multiple assistant messages', () => {
  render(
    <ChatMessageList
      messages={['First answer', 'Second answer'].map((text, i) => ({
        id: String(i),
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text }],
      }))}
      isStreaming={false}
      assistantName="Mira"
      footer={<div data-testid="live-result">Calendar results</div>}
    />
  );
  expect(screen.getAllByTestId('live-result')).toHaveLength(1);
});
