'use client';

import { Check, Copy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function CopyButton({ code }: { code: string }) {
  const t = useTranslations('ui-showcase.docs.code');
  const [copied, setCopied] = useState(false);

  return (
    <Button
      aria-label={copied ? t('copied') : t('copy')}
      className="absolute top-2 right-2"
      onClick={async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      size="icon"
      type="button"
      variant="ghost"
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}
