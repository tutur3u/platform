import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { expect, it, vi } from 'vitest';
import { useChatScrollFollow } from './use-chat-scroll-follow';

it('follows growing text without pulling a reader away from earlier history', () => {
  const node = document.createElement('div');
  Object.defineProperties(node, {
    scrollHeight: { value: 1000, configurable: true },
    clientHeight: { value: 400 },
  });
  node.scrollTo = vi.fn();
  node.scrollTop = 600;
  const ref = { current: node };
  const messages: UIMessage[] = [
    {
      id: 'spoken',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello' }],
    },
  ];
  const { rerender } = renderHook(
    ({ rows }) => useChatScrollFollow(ref, rows),
    { initialProps: { rows: messages } }
  );
  expect(node.scrollTo).toHaveBeenCalledTimes(1);
  rerender({
    rows: [{ ...messages[0]!, parts: [{ type: 'text', text: 'Hello again' }] }],
  });
  expect(node.scrollTo).toHaveBeenCalledTimes(2);
  act(() => {
    node.scrollTop = 100;
    node.dispatchEvent(new Event('scroll'));
  });
  rerender({ rows: [...messages] });
  expect(node.scrollTo).toHaveBeenCalledTimes(2);
});
