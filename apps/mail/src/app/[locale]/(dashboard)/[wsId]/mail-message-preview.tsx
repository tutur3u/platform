'use client';

import type { MailAttachment } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useEffect, useRef, useState } from 'react';
import { buildMailMessagePreviewDocument } from './mail-message-preview-utils';
import { useMailPreviewAppearance } from './mail-preview-appearance';
import { applyMailPreviewContrast } from './mail-preview-contrast';

export function MailMessagePreview({
  content,
  attachments,
  darkLabel,
  originalLabel,
  title,
  viewLabel,
}: {
  content: string;
  attachments: MailAttachment[];
  darkLabel: string;
  originalLabel: string;
  title: string;
  viewLabel: string;
}) {
  const [mode, setSelectedMode] = useMailPreviewAppearance();
  const frame = useRef<HTMLIFrameElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState<string | number>(
    'max(20rem, calc(100dvh - 13rem))'
  );
  const inlineImages = Object.fromEntries(
    attachments
      .filter(
        (attachment) =>
          attachment.contentId &&
          attachment.protectedUrl &&
          /^image\/(png|jpeg|gif|webp|avif)$/i.test(attachment.contentType)
      )
      .map((attachment) => [
        attachment.contentId!.replace(/^<|>$/g, ''),
        attachment.protectedUrl!,
      ])
  );
  useEffect(() => () => observer.current?.disconnect(), []);
  function resize() {
    const body = frame.current?.contentDocument?.body;
    if (body)
      setHeight(
        Math.max(
          160,
          Math.min(30_000, Math.ceil(body.getBoundingClientRect().height) + 16)
        )
      );
  }
  function observeContent() {
    observer.current?.disconnect();
    const body = frame.current?.contentDocument?.body;
    if (!body) return;
    if (mode === 'dark') applyMailPreviewContrast(body.ownerDocument);
    observer.current = new ResizeObserver(resize);
    observer.current.observe(body);
    resize();
  }

  return (
    <div className="min-w-0 max-w-full overflow-hidden bg-background">
      <fieldset
        className="flex items-center justify-end gap-1 px-4 pb-2 md:px-6"
        aria-label={viewLabel}
      >
        <Button
          aria-pressed={mode === 'dark'}
          onClick={() => setSelectedMode('dark')}
          size="sm"
          type="button"
          variant={mode === 'dark' ? 'secondary' : 'ghost'}
        >
          {darkLabel}
        </Button>
        <Button
          aria-pressed={mode === 'original'}
          onClick={() => setSelectedMode('original')}
          size="sm"
          type="button"
          variant={mode === 'original' ? 'secondary' : 'ghost'}
        >
          {originalLabel}
        </Button>
      </fieldset>
      <iframe
        className="block w-full max-w-full border-0 bg-background"
        ref={frame}
        onLoad={observeContent}
        style={{ height }}
        referrerPolicy="no-referrer"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={buildMailMessagePreviewDocument(content, mode, inlineImages)}
        title={title}
      />
    </div>
  );
}
