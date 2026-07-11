'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import {
  buildMailMessagePreviewDocument,
  type MailMessagePreviewMode,
} from './mail-message-preview-utils';

export function MailMessagePreview({
  content,
  darkLabel,
  originalLabel,
  title,
  viewLabel,
}: {
  content: string;
  darkLabel: string;
  originalLabel: string;
  title: string;
  viewLabel: string;
}) {
  const { resolvedTheme } = useTheme();
  const [selectedMode, setSelectedMode] =
    useState<MailMessagePreviewMode | null>(null);
  const mode = selectedMode ?? (resolvedTheme === 'dark' ? 'dark' : 'original');

  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-dynamic bg-background">
      <div className="flex items-center justify-end gap-1 border-dynamic border-b bg-foreground/[0.025] px-2 py-1.5">
        <span className="mr-auto pl-1 text-muted-foreground text-xs">
          {viewLabel}
        </span>
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
      </div>
      <iframe
        className="block min-h-80 w-full max-w-full border-0 bg-background"
        sandbox=""
        srcDoc={buildMailMessagePreviewDocument(content, mode)}
        title={title}
      />
    </div>
  );
}
