'use client';

import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useMemo, useRef } from 'react';

interface EmailHtmlViewerProps {
  content: string;
  previewTheme?: 'light' | 'dark';
  className?: string;
  onLoad?: () => void;
}

const PREVIEW_STYLE = `
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 16px;
        background-color: #ffffff;
        color: #000000;
        transition: background-color 0.3s ease, color 0.3s ease;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }

      html.dark {
        filter: invert(1) hue-rotate(180deg);
      }

      html.dark img,
      html.dark video,
      html.dark picture,
      html.dark svg,
      html.dark [style*="background-image"] {
        filter: invert(1) hue-rotate(180deg);
      }
`;

function isFullHtmlDocument(content: string) {
  return /<!doctype\s+html|<html[\s>]/iu.test(content);
}

function injectPreviewStyle(content: string, previewTheme: 'light' | 'dark') {
  const htmlClass = previewTheme === 'dark' ? ' class="dark"' : '';
  const style = `<style>${PREVIEW_STYLE}</style>`;
  const withHtmlClass = content.replace(/<html(\s[^>]*)?>/iu, (match) => {
    if (/\sclass=/iu.test(match)) {
      return match.replace(
        /\sclass=(["'])(.*?)\1/iu,
        (_classMatch, quote, value) =>
          previewTheme === 'dark'
            ? ` class=${quote}${value} dark${quote}`
            : ` class=${quote}${value}${quote}`
      );
    }
    return match.replace(/<html/iu, `<html${htmlClass}`);
  });

  if (/<\/head>/iu.test(withHtmlClass)) {
    return withHtmlClass.replace(/<\/head>/iu, `${style}</head>`);
  }

  return `<!DOCTYPE html><html${htmlClass}><head>${style}</head><body>${withHtmlClass}</body></html>`;
}

/**
 * The preview document, always light; `applyPreviewTheme` toggles dark mode
 * in place so switching themes never reloads the frame.
 */
function previewDocument(content: string) {
  if (isFullHtmlDocument(content)) return injectPreviewStyle(content, 'light');
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="color-scheme" content="light dark">
    <style>
      ${PREVIEW_STYLE}
    </style>
  </head>
  <body>
    ${content}
  </body>
</html>`;
}

export function EmailHtmlViewer({
  content,
  previewTheme = 'light',
  className,
  onLoad,
}: EmailHtmlViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // `srcDoc` goes through the parent's Trusted Types policy; writing into an
  // about:blank frame would hit the frame's own registry, which has none.
  const srcDoc = useMemo(
    () => (content ? previewDocument(content) : undefined),
    [content]
  );

  const applyPreviewTheme = useCallback(() => {
    iframeRef.current?.contentDocument?.documentElement?.classList.toggle(
      'dark',
      previewTheme === 'dark'
    );
  }, [previewTheme]);

  // Handle dark mode toggle without reloading iframe
  useEffect(applyPreviewTheme, [applyPreviewTheme]);

  return (
    <iframe
      ref={iframeRef}
      title="Email Preview"
      className={cn('h-full w-full border-0 bg-white', className)}
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      onLoad={() => {
        applyPreviewTheme();
        if (srcDoc) onLoad?.();
      }}
    />
  );
}
