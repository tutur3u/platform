'use client';

import { TriangleAlert } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { useRoomMira } from './use-room-mira';

/** Anyone can report a minor; a second press confirms, never a dialog. */
export function ReportMinor({ mira }: { mira: ReturnType<typeof useRoomMira> }) {
  const t = useTranslations('meet.mira_consent');
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-1">
      {confirming && (
        <p role="status" className="text-muted-foreground text-xs">
          {t('report_minor_hint')}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant={confirming ? 'destructive' : 'ghost'}
        disabled={mira.acceptance.isPending}
        onClick={() =>
          confirming
            ? mira.acceptance.mutate('report', {
                onSettled: () => setConfirming(false),
              })
            : setConfirming(true)
        }
      >
        <TriangleAlert aria-hidden className="size-4" />
        {confirming ? t('report_minor_confirm') : t('report_minor')}
      </Button>
    </div>
  );
}
