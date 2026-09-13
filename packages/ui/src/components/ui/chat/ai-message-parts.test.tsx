import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AiMessageParts } from './ai-message-parts';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./ai-message-markdown', () => ({
  AssistantMarkdown: ({ text }: { text: string }) => <p>{text}</p>,
}));
vi.mock('./ai-message-tool-part', () => ({
  isAiToolPart: (part: { type: string }) => part.type === 'dynamic-tool',
  ToolGroup: ({ parts }: { parts: { toolCallId: string }[] }) => (
    <div>{parts.map((part) => part.toolCallId).join(',')}</div>
  ),
}));

it('keeps text between tool batches in the rendered history timeline', () => {
  const { container } = render(
    <AiMessageParts
      parts={[
        { type: 'text', text: 'Before lookup' },
        { type: 'dynamic-tool', toolCallId: 'lookup-1' },
        { type: 'dynamic-tool', toolCallId: 'lookup-2' },
        { type: 'text', text: 'After lookup' },
        { type: 'dynamic-tool', toolCallId: 'save-1' },
        { type: 'text', text: 'Saved' },
      ]}
    />
  );
  expect(container.textContent).toBe(
    'Before lookuplookup-1,lookup-2After lookupsave-1Saved'
  );
  expect(screen.getByText('lookup-1,lookup-2')).toBeInTheDocument();
});

it('restores compact text references in place without duplicating fallback text', () => {
  const { container } = render(
    <AiMessageParts
      textFallback={'Before\n\nAfter'}
      parts={[
        { type: 'text', textStart: 0, textLength: 6 },
        { type: 'dynamic-tool', toolCallId: 'lookup' },
        { type: 'text', textStart: 8, textLength: 5 },
      ]}
    />
  );
  expect(container.textContent).toBe('BeforelookupAfter');
});
