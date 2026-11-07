'use client';

import { X } from '@tuturuuu/icons';
import {
  type LegalNoticeConfig,
  legalNotice,
} from '@tuturuuu/legal/notice-config';
import {
  isLegalNoticeWindowOpen,
  legalNoticeBannerCopy,
} from '@tuturuuu/legal/notice-window';
import { cn } from '@tuturuuu/utils/format';
import { useLocale } from 'next-intl';
import { useSyncExternalStore } from 'react';

export const LEGAL_NOTICE_DISMISS_KEY_PREFIX =
  'tuturuuu:legal-notice-dismissed:';
export const PLATFORM_LEGAL_CHANGES_URL = 'https://tuturuuu.com/legal/changes';
// Floats over app content so full-height shells keep their layout.
export const LEGAL_NOTICE_FLOATING_CLASSNAME =
  'fixed inset-x-2 bottom-2 z-50 md:inset-x-auto md:right-4 md:bottom-4 md:max-w-md';

// Fallback when storage throws (private mode, blocked site data).
const memoryDismissed = new Set<string>();
const listeners = new Set<() => void>();

function isDismissed(key: string) {
  if (memoryDismissed.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function dismiss(key: string) {
  memoryDismissed.add(key);
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Dismissal still holds for this page session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface LegalNoticeBannerProps {
  className?: string;
  config?: LegalNoticeConfig;
  href?: string;
  now?: () => Date;
}

// In-app Terms/Privacy change notice. Renders nothing outside the published
// notice window; dismissal is per browser per notice version. No tracking.
export function LegalNoticeBanner({
  className,
  config = legalNotice,
  href = '/legal/changes',
  now = () => new Date(),
}: LegalNoticeBannerProps) {
  const locale = useLocale();
  const key = `${LEGAL_NOTICE_DISMISS_KEY_PREFIX}${config.noticeDate ?? ''}`;
  // Time and storage are read on the client only; the server snapshot hides
  // the banner so prerendering never depends on the clock.
  const visible = useSyncExternalStore(
    subscribe,
    () => isLegalNoticeWindowOpen(config, now()) && !isDismissed(key),
    () => false
  );

  if (!visible) return null;

  const copy =
    legalNoticeBannerCopy[locale === 'vi' ? 'vi' : 'en'] ??
    legalNoticeBannerCopy.en;

  return (
    <section
      aria-label={copy.message}
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-foreground text-sm shadow-sm',
        className
      )}
    >
      <p className="min-w-0 flex-1">
        {copy.message}{' '}
        <a className="font-medium underline underline-offset-2" href={href}>
          {copy.link}
        </a>
      </p>
      <button
        aria-label={copy.dismiss}
        className="rounded-md p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        onClick={() => dismiss(key)}
        type="button"
      >
        <X aria-hidden className="size-4" />
      </button>
    </section>
  );
}
