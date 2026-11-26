'use client';

import { Button } from '@tuturuuu/ui/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function EventGuestRejoinNotice() {
  const router = useRouter();
  const t = useTranslations('meet.call.guest_join');
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm">
      <p role="status">{t('event_rejoin_notice')}</p>
      <Button size="sm" variant="outline" onClick={() => router.refresh()}>
        {t('event_rejoin_verify')}
      </Button>
    </div>
  );
}
