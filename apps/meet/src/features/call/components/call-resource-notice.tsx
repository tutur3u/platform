'use client';
import { useTranslations } from 'next-intl';

/** Limit call-wide notices to actionable room resource errors. */
export function resourceErrorKey(error: string | null) {
  return error === 'participant_limit_reached' ||
    error === 'publisher_limit_reached' ||
    error === 'media_track_limit_reached'
    ? error
    : null;
}
/** Render resource failures without a persistent duration warning banner. */
export function CallResourceNotice({ error }: { error: string | null }) {
  const t = useTranslations('meet.call');
  const key = resourceErrorKey(error);
  if (!key) return null;
  return (
    <aside
      className="border-b bg-muted/40 px-3 py-2 text-muted-foreground text-xs"
      role="alert"
    >
      {t(key)}
    </aside>
  );
}
