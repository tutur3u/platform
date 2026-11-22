'use client';

import { AlertTriangle, Check, Copy } from '@tuturuuu/icons/lucide-static';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  latestAuthInlineErrorId,
  useLatestAuthInlineError,
} from './auth-inline-error-store';

/**
 * Repeats the latest sign-in error toast inside the card, with role=alert
 * and a copyable reference. It shows only errors raised while it is mounted
 * (a step change remounts it) and hides an error once a new attempt starts.
 */
export function AuthInlineError({ busy }: { busy: boolean }) {
  const t = useTranslations('login');
  const error = useLatestAuthInlineError();
  const [dismissedId, setDismissedId] = useState(latestAuthInlineErrorId);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // A new attempt retires the error it answers; a later failure shows again.
  if (busy && error && error.id > dismissedId) setDismissedId(error.id);

  if (!error || error.id <= dismissedId || busy) return null;

  const referenceLabel = error.reference
    ? t('diagnostic_reference', { code: error.reference })
    : null;
  const description =
    referenceLabel && error.description?.endsWith(referenceLabel)
      ? error.description.slice(0, -referenceLabel.length).trim()
      : error.description;
  const copyReference = async () => {
    if (!error.reference) return;
    try {
      await navigator.clipboard.writeText(error.reference);
      setCopiedId(error.id);
    } catch {
      // Clipboard access can be blocked; the code stays visible to copy.
    }
  };

  return (
    <div
      className="flex items-start gap-3 rounded-2xl bg-dynamic-red/10 px-3.5 py-3 text-dynamic-red text-sm leading-relaxed"
      role="alert"
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-bold">{error.title}</p>
        {description ? <p>{description}</p> : null}
        {error.reference ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{referenceLabel}</span>
            <button
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 font-semibold text-xs underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              onClick={() => void copyReference()}
              type="button"
            >
              {copiedId === error.id ? (
                <Check aria-hidden className="size-3.5" />
              ) : (
                <Copy aria-hidden className="size-3.5" />
              )}
              {copiedId === error.id
                ? t('reference_copied')
                : t('copy_reference')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
