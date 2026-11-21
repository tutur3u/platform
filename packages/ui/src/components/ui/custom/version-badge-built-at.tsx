'use client';

import { cn } from '@tuturuuu/utils/format';
import { useFormatter, useNow, useTimeZone, useTranslations } from 'next-intl';
import { useState } from 'react';

/** How often the relative build time ("5 minutes ago") refreshes. */
const RELATIVE_TIME_REFRESH_MS = 30_000;

/**
 * A build timestamp shown as relative time. Pressing it switches to the exact
 * time in the viewer's locale and time zone; the other form is in the title.
 */
export function VersionBadgeBuiltAt({
  builtAt,
  className,
}: {
  builtAt: string;
  className?: string;
}) {
  const t = useTranslations('version-badge');
  const format = useFormatter();
  const now = useNow({ updateInterval: RELATIVE_TIME_REFRESH_MS });
  const configuredTimeZone = useTimeZone();
  const [exact, setExact] = useState(false);
  const time = Date.parse(builtAt);

  if (!Number.isFinite(time)) {
    return <span className={className}>{t('not_available')}</span>;
  }

  const date = new Date(time);
  // A build clock slightly ahead of the viewer's reads as "now", not "in 1 minute".
  const relative = format.relativeTime(
    new Date(Math.min(time, now.getTime())),
    now
  );
  // Providers without a configured zone get the viewer's, explicitly, so
  // next-intl does not report an environment fallback.
  const absolute = format.dateTime(date, {
    dateStyle: 'medium',
    timeStyle: 'long',
    timeZone:
      configuredTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return (
    <button
      type="button"
      aria-pressed={exact}
      title={exact ? relative : absolute}
      onClick={() => setExact((current) => !current)}
      className={cn(
        'rounded-sm text-left underline decoration-border decoration-dotted underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      <time dateTime={date.toISOString()}>{exact ? absolute : relative}</time>
      <span className="sr-only">{t('built_at_toggle_label')}</span>
    </button>
  );
}
