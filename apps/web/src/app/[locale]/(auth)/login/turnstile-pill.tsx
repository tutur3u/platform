'use client';

import {
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
} from '@tuturuuu/icons/lucide-static';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  TURNSTILE_PILL_LABEL_KEYS,
  type TurnstilePillState,
} from './turnstile-pill-state';

function PillIcon({ state }: { state: TurnstilePillState }) {
  switch (state) {
    case 'checking':
      return <LoadingIndicator className="size-3.5" />;
    case 'passed':
      return (
        <ShieldCheck aria-hidden className="size-3.5 text-dynamic-green" />
      );
    case 'failed':
    case 'unavailable':
      return (
        <AlertTriangle aria-hidden className="size-3.5 text-destructive" />
      );
  }
}

/**
 * The sign-in security check as a quiet status pill above Cloudflare's own
 * widget. The widget keeps its options, callbacks and token handling; once a
 * token is held its slot folds away (inert, so it takes no focus) and opens
 * again as soon as the token is spent, reset or expires.
 */
export function TurnstilePill({
  children,
  detail,
  onRetry,
  state,
}: {
  /** The widget slot; omitted when the check is unavailable. */
  children?: ReactNode;
  /** The existing error copy for a failed or unavailable check. */
  detail?: string;
  onRetry?: () => void;
  state: TurnstilePillState;
}) {
  const t = useTranslations();
  const folded = state === 'passed';

  return (
    <div
      className="flex flex-col items-center gap-2"
      data-turnstile-slot
      data-turnstile-state={state}
    >
      <div className="flex min-h-9 items-center gap-1">
        <p
          aria-live="polite"
          className="inline-flex min-h-8 items-center gap-2 rounded-full bg-secondary px-3.5 font-semibold text-muted-foreground text-xs"
          role="status"
        >
          <PillIcon state={state} />
          <span>{t(TURNSTILE_PILL_LABEL_KEYS[state])}</span>
        </p>
        {state === 'failed' && onRetry ? (
          <button
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 font-semibold text-foreground text-xs underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            onClick={onRetry}
            type="button"
          >
            <RefreshCw aria-hidden className="size-3.5" />
            {t('login.turnstile_retry')}
          </button>
        ) : null}
      </div>
      {children ? (
        <div
          className={cn(
            'grid w-full justify-items-center transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none',
            folded ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
          )}
          data-turnstile-widget
          inert={folded}
        >
          <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
      ) : null}
      {detail && state !== 'checking' && state !== 'passed' ? (
        <p className="text-balance text-center text-destructive text-sm">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
