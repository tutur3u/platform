import { VideoOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import type { MediaPolicy } from '../lib/media-policy';

/** Shown while cameras are paused on a poor link; speech keeps playing. */
export function VideoPausedNotice({ policy }: { policy?: MediaPolicy }) {
  const t = useTranslations('meet.call');
  const audioOnly = useSyncExternalStore(
    policy?.subscribe ?? noSubscribe,
    () => policy?.getSnapshot().audioOnly ?? false,
    () => false
  );
  if (!policy || !audioOnly) return null;
  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 px-2 pb-1 text-muted-foreground text-sm"
    >
      <VideoOff className="size-4" aria-hidden />
      <span>{t('video_paused_network')}</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => policy.setAudioOnly(false)}
      >
        {t('resume_video')}
      </Button>
    </div>
  );
}

const noSubscribe = () => () => undefined;
