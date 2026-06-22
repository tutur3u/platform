'use client';

import { Check, Copy } from '@tuturuuu/icons/lucide-static';
import { Button } from '@tuturuuu/ui/button';
import { useState } from 'react';
import { useUiDocsTranslator } from './ui-docs-i18n';

export function CopyButton({ code }: { code: string }) {
  const t = useUiDocsTranslator('docs');
  const [copied, setCopied] = useState(false);

  return (
    <Button
      aria-label={copied ? t('code.copied') : t('code.copy')}
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
