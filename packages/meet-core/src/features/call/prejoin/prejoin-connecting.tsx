'use client';

import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePrejoin, usePrejoinInfo } from './prejoin-context';
import { PrejoinStage } from './prejoin-stage';

/**
 * The pre-join layout while the device session and the call shell load. It is
 * the same stage the room shows next, so Join is a spinner button rather than
 * a separate loading screen.
 */
export function PrejoinConnecting() {
  const t = useTranslations('meet.call');
  const capture = usePrejoin();
  const info = usePrejoinInfo();
  if (!capture || !info) return null;
  return (
    <PrejoinStage
      avatarUrl={info.avatarUrl}
      capture={capture}
      eyebrow={t('ready_to_join')}
      fields={
        <p className="text-sm">
          <span className="text-muted-foreground">{t('joining_as')} </span>
          <span className="break-words font-medium">{info.displayName}</span>
        </p>
      }
      name={info.displayName}
      onSubmit={() => undefined}
      phase={{ kind: 'connecting', label: t('join_now') }}
      secondary={
        <Button asChild className="w-full" variant="ghost">
          <Link href={info.leaveHref}>{t('leave')}</Link>
        </Button>
      }
      title={info.meetingName}
    />
  );
}
