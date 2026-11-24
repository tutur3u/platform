'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useLocale } from 'next-intl';

export function RelativeTime({ value }: { value: string }) {
  const locale = useLocale() === 'vi' ? vi : enUS;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return (
    <time
      dateTime={value}
      title={format(date, 'PPp', { locale })}
      className="text-muted-foreground text-xs"
    >
      {formatDistanceToNow(date, { addSuffix: true, locale })}
    </time>
  );
}
