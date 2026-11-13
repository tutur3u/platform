// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AssistantMarkdown } from './chat-message-list/markdown-components';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('renders the first text delta and subsequent text without advancing timers', () => {
  vi.useFakeTimers();
  const view = render(<AssistantMarkdown text="Hello" isAnimating />);
  expect(screen.getByText('Hello')).toBeTruthy();
  view.rerender(<AssistantMarkdown text="Hello world" isAnimating />);
  expect(screen.getByText('Hello world')).toBeTruthy();
});
