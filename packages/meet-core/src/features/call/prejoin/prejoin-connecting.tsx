'use client';

import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const capture = usePrejoin();
  const info = usePrejoinInfo();
  if (!capture || !info) return null;
  return (
    <PrejoinStage
      avatarUrl={info.avatarUrl}
      capture={capture}
      fields={
        <p className="text-sm">
          <span className="text-muted-foreground">{t('joining_as')} </span>
          <span className="break-words font-medium">{info.displayName}</span>
        </p>
      }
      back={{
        label: t('prejoin.back'),
        onClick: () => {
          capture.release();
          router.push(info.leaveHref);
        },
      }}
      name={info.displayName}
      onSubmit={() => undefined}
      phase={{ kind: 'connecting', label: t('join_now') }}
      title={info.meetingName}
    />
  );
}
