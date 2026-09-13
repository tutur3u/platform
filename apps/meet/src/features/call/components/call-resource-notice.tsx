'use client';
import { useFormatter, useTranslations } from 'next-intl';

export function resourceErrorKey(error: string | null) {
  return error === 'participant_limit_reached' ||
    error === 'publisher_limit_reached' ||
    error === 'media_track_limit_reached'
    ? error
    : null;
}
export function CallResourceNotice({
  error,
  expiresAt,
}: {
  error: string | null;
  expiresAt?: string;
}) {
  const t = useTranslations('meet.call');
  const format = useFormatter();
  const key = resourceErrorKey(error);
  const deadline = expiresAt ? new Date(expiresAt) : null;
  if (!key && (!deadline || !Number.isFinite(deadline.getTime()))) return null;
  return (
    <aside
      className="border-b bg-muted/40 px-3 py-2 text-muted-foreground text-xs"
      role={key ? 'alert' : undefined}
    >
      {key
        ? t(key)
        : t('room_deadline', {
            time: format.dateTime(deadline!, {
              hour: 'numeric',
              minute: '2-digit',
              timeZoneName: 'short',
            }),
          })}
    </aside>
  );
}
