'use client';

import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef } from 'react';

interface EmailHtmlViewerProps {
  content: string;
  previewTheme?: 'light' | 'dark';
  className?: string;
  onLoad?: () => void;
}

export function EmailHtmlViewer({
  content,
  previewTheme = 'light',
  className,
  onLoad,
}: EmailHtmlViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current || !content) return;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument;
    if (!doc) return;

    // Only write content if it's strictly different or empty
    // We add a meta tag to prevent hydration mismatch
    const htmlContent = `<!DOCTYPE html>
<html class="${previewTheme === 'dark' ? 'dark' : ''}">
  <head>
    <meta name="color-scheme" content="light dark">
    <style>
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
      
      /* Dark mode simulation using CSS filter for content */
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


    </style>
  </head>
  <body>
    ${content}
  </body>
</html>`;

    doc.open();
    doc.write(htmlContent);
    doc.close();

    if (onLoad) {
      onLoad();
    }
  }, [content, previewTheme, onLoad]);

  // Handle dark mode toggle without reloading iframe
  useEffect(() => {
    if (!iframeRef.current) return;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument;
    if (!doc || !doc.documentElement) return;

    if (previewTheme === 'dark') {
      doc.documentElement.classList.add('dark');
    } else {
      doc.documentElement.classList.remove('dark');
    }
  }, [previewTheme]);

  return (
    <iframe
      ref={iframeRef}
      title="Email Preview"
      className={cn('h-full w-full border-0 bg-white', className)}
      sandbox="allow-same-origin"
    />
  );
}
