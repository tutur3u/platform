'use client';

import * as React from 'react';

export interface useCopyToClipboardProps {
  timeout?: number;
}

export function useCopyToClipboard({
  timeout = 2000,
}: useCopyToClipboardProps) {
  const [isCopied, setIsCopied] = React.useState<Boolean>(false);

  const copyToClipboard = async (value: string) => {
    if (typeof window === 'undefined' || !navigator.clipboard) {
      return;
    }

    if (!value) {
      return;
    }

    try {
      const textBlob = new Blob([value], { type: 'text/plain' });
      const clipboardItem = new ClipboardItem({
        'text/plain': textBlob,
      });

      await navigator.clipboard.write([clipboardItem]);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), timeout);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback to basic text copying
      try {
        await navigator.clipboard.writeText(value);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), timeout);
      } catch (err) {
        console.error('Failed to copy text:', err);
      }
    }
  };

  return { isCopied, copyToClipboard };
}
