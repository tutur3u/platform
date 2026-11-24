'use client';

import { Info, X } from '@tuturuuu/icons';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** The storage move invalidates older links; the notice stops after this. */
export const DRIVE_LINK_NOTICE_UNTIL = Date.parse('2027-01-05T00:00:00Z');
export const DRIVE_LINK_NOTICE_STORAGE_KEY =
  'drive:storage-move-link-notice-dismissed';

function readDismissed() {
  try {
    return window.localStorage.getItem(DRIVE_LINK_NOTICE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function shouldShowDriveLinkNotice(now: number, dismissed: boolean) {
  return !dismissed && now < DRIVE_LINK_NOTICE_UNTIL;
}

/**
 * A one-time notice that links made before the storage move stop working.
 * Dismissal is a per-viewer convenience kept in this browser only.
 */
export function DriveLinkNotice() {
  const t = useTranslations('drive');
  const [visible, setVisible] = useState(() =>
    shouldShowDriveLinkNotice(Date.now(), readDismissed())
  );
  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DRIVE_LINK_NOTICE_STORAGE_KEY, '1');
    } catch {
      // Storage can be unavailable; the notice still hides for this view.
    }
  };

  return (
    <Alert role="note" variant="info">
      <Info aria-hidden className="size-4" />
      <div className="flex items-start gap-2">
        <AlertDescription className="min-w-0 flex-1">
          {t('share.migration_notice')}
        </AlertDescription>
        <Button
          aria-label={t('share.dismiss_notice')}
          className="-my-1 -mr-1 size-7 shrink-0"
          onClick={dismiss}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </Alert>
  );
}
