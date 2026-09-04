'use client';

import { useEffect, useRef } from 'react';
import {
  EMBED_MESSAGE_SOURCE,
  EMBED_MESSAGE_TYPES,
  type EmbedMessage,
} from './protocol';

/**
 * Reports the embedded form's height to the host page.
 *
 * An iframe cannot size itself, so an inline embed would otherwise either
 * scroll inside a fixed box or reserve far too much space. A `ResizeObserver`
 * on the content posts the real height whenever it changes — which it does a
 * lot in a form, as sections open, validation messages appear and branching
 * swaps the visible questions.
 *
 * Messages are posted to `*` because the host origin is unknown by design: any
 * site may embed a public form. Nothing sensitive is sent — a height, a share
 * code that is already public, and a submitted flag.
 */
export function EmbedFrame({
  children,
  shareCode,
  submitted,
}: {
  children: React.ReactNode;
  shareCode: string;
  /** Flips to true once the respondent submits, so overlays can dismiss. */
  submitted?: boolean;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastHeightRef = useRef(0);

  useEffect(() => {
    const node = contentRef.current;
    if (!node || window.parent === window) return;

    const post = (message: Omit<EmbedMessage, 'source'>) => {
      window.parent.postMessage(
        { ...message, source: EMBED_MESSAGE_SOURCE } satisfies EmbedMessage,
        '*'
      );
    };

    const postHeight = () => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      // Sub-pixel churn during animation would otherwise post on every frame
      // and make the host iframe visibly jitter.
      if (Math.abs(height - lastHeightRef.current) < 2) return;

      lastHeightRef.current = height;
      post({ height, shareCode, type: EMBED_MESSAGE_TYPES.resize });
    };

    post({ shareCode, type: EMBED_MESSAGE_TYPES.ready });
    postHeight();

    const observer = new ResizeObserver(postHeight);
    observer.observe(node);

    return () => observer.disconnect();
  }, [shareCode]);

  useEffect(() => {
    if (!submitted || window.parent === window) return;

    window.parent.postMessage(
      {
        shareCode,
        source: EMBED_MESSAGE_SOURCE,
        type: EMBED_MESSAGE_TYPES.submitted,
      } satisfies EmbedMessage,
      '*'
    );
  }, [shareCode, submitted]);

  return (
    <div className="min-h-0 bg-transparent" ref={contentRef}>
      {children}
    </div>
  );
}
