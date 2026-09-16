'use client';

import { LoaderCircle } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useLiveAPIContext } from '@/hooks/use-live-api';

export function LiveInteractionStatus() {
  const { client, connected } = useLiveAPIContext();
  const [working, setWorking] = useState(false);
  const t = useTranslations('dashboard.voice_assistant');
  useEffect(() => {
    const status = (value: 'IN_PROGRESS' | 'IDLE') =>
      setWorking(value === 'IN_PROGRESS');
    const reset = () => setWorking(false);
    client.on('interactionstatus', status).on('close', reset);
    return () => {
      client.off('interactionstatus', status).off('close', reset);
    };
  }, [client]);
  return (
    <div role="status" className="min-h-5 px-3 text-muted-foreground text-xs">
      {connected && working && (
        <span className="inline-flex items-center gap-1.5">
          <LoaderCircle aria-hidden className="size-3 animate-spin" />
          {t('working_background')}
        </span>
      )}
    </div>
  );
}
