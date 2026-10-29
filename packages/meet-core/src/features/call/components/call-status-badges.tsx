'use client';

import { Circle, Leaf } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

/** Header status chips: solo mode and the room recording indicator. */
export function CallStatusBadges({
  solo,
  recording,
}: {
  solo: boolean;
  recording: boolean;
}) {
  const t = useTranslations('meet.call');
  return (
    <>
      {solo && (
        <output
          className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-muted-foreground text-xs"
          title={t('solo_hint')}
        >
          <Leaf className="size-3.5" />
          {t('solo_mode')}
        </output>
      )}
      {recording && (
        <span className="flex items-center gap-1.5 rounded-full bg-dynamic-red/10 px-2 py-1 text-dynamic-red text-xs">
          <Circle className="size-2 fill-current motion-safe:animate-pulse" />
          {t('recording')}
        </span>
      )}
    </>
  );
}
