'use client';

import { Check, Copy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';

type CopyState =
  | { kind: 'idle' }
  | { kind: 'copied'; text: string }
  | { kind: 'failed'; text: string };

async function writeClipboard(text: string) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(text);
}

/** One labelled citation value with its own copy action and failure fallback. */
export function CitationResultBlock({
  label,
  copyLabel,
  value,
}: {
  label: string;
  copyLabel: string;
  value: string;
}) {
  const t = useTranslations('cite.output');
  const id = useId();
  const [copy, setCopy] = useState<CopyState>({ kind: 'idle' });

  // Copy feedback belongs to the exact text that was copied.
  const current: CopyState =
    copy.kind !== 'idle' && copy.text !== value ? { kind: 'idle' } : copy;

  useEffect(() => {
    if (current.kind !== 'copied') return;
    const timer = window.setTimeout(() => setCopy({ kind: 'idle' }), 2000);
    return () => window.clearTimeout(timer);
  }, [current.kind]);

  const handleCopy = async () => {
    try {
      await writeClipboard(value);
      setCopy({ kind: 'copied', text: value });
    } catch {
      setCopy({ kind: 'failed', text: value });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-sm" id={`${id}-label`}>
          {label}
        </h3>
        <Button
          aria-label={copyLabel}
          onClick={handleCopy}
          size="sm"
          type="button"
          variant="outline"
        >
          {current.kind === 'copied' ? <Check /> : <Copy />}
          {current.kind === 'copied' ? t('copied') : t('copy')}
        </Button>
      </div>
      <p
        aria-labelledby={`${id}-label`}
        className="select-all break-words rounded-md border border-border bg-background px-3 py-2.5 text-sm leading-relaxed"
      >
        {value}
      </p>
      <p aria-live="polite" className="text-foreground text-xs">
        {current.kind === 'failed' ? t('copy_failed') : null}
        {current.kind === 'copied' ? (
          <span className="sr-only">{t('copied')}</span>
        ) : null}
      </p>
    </div>
  );
}
