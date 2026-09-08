'use client';

import type { MailAttachment } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { buildMailMessagePreviewDocument } from './mail-message-preview-utils';
import { useMailPreviewAppearance } from './mail-preview-appearance';
import { applyMailPreviewContrast } from './mail-preview-contrast';

const subscribeHydration = () => () => {};

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
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false
  );
  const [readyDocument, setReadyDocument] = useState<string | null>(null);
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
  const previewDocument = buildMailMessagePreviewDocument(
    content,
    mode,
    inlineImages
  );
  useEffect(() => () => observer.current?.disconnect(), []);
  const resize = useCallback(() => {
    const body = frame.current?.contentDocument?.body;
    if (body)
      setHeight(
        Math.max(
          160,
          Math.min(30_000, Math.ceil(body.getBoundingClientRect().height) + 16)
        )
      );
  }, []);
  const observeContent = useCallback(() => {
    observer.current?.disconnect();
    const body = frame.current?.contentDocument?.body;
    if (!hydrated || !body?.hasAttribute('data-mail-preview')) return;
    if (mode === 'dark') {
      applyMailPreviewContrast(
        body.ownerDocument,
        frame.current?.parentElement
      );
    }
    setReadyDocument(previewDocument);
    observer.current = new ResizeObserver(resize);
    observer.current.observe(body);
    resize();
  }, [hydrated, mode, previewDocument, resize]);

  useEffect(() => {
    if (!hydrated) return;
    let request = 0;
    const prepare = () => {
      const document = frame.current?.contentDocument;
      if (
        document?.readyState !== 'loading' &&
        document?.body?.hasAttribute('data-mail-preview')
      ) {
        // Do not wait for remote images to finish downloading before reading.
        observeContent();
      } else {
        request = requestAnimationFrame(prepare);
      }
    };
    request = requestAnimationFrame(prepare);
    return () => cancelAnimationFrame(request);
  }, [hydrated, observeContent]);

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
        key={previewDocument}
        className="block w-full max-w-full border-0 bg-background"
        ref={frame}
        onLoad={observeContent}
        style={{
          height,
          visibility:
            hydrated && readyDocument === previewDocument
              ? 'visible'
              : 'hidden',
        }}
        referrerPolicy="no-referrer"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={hydrated ? previewDocument : undefined}
        title={title}
      />
    </div>
  );
}
