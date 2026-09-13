'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';

/** Follow growing speech/text only while the reader is already at the bottom. */
export function useChatScrollFollow(
  ref: RefObject<HTMLDivElement | null>,
  messages: UIMessage[]
) {
  const following = useRef(true);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      following.current =
        node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    };
    node.addEventListener('scroll', update, { passive: true });
    return () => node.removeEventListener('scroll', update);
  }, [ref]);
  useLayoutEffect(() => {
    const node = ref.current;
    if (messages.length && node && following.current)
      node.scrollTo({ top: node.scrollHeight, behavior: 'instant' });
  }, [messages, ref]);
}
