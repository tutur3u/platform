import { Clock } from '@tuturuuu/icons';
import { getTranslations } from 'next-intl/server';
import { getHostMeetingDurationSeconds } from '../lib/meeting-duration';

export async function MeetingDurationInfo({ hostId }: { hostId: string }) {
  const [seconds, t] = await Promise.all([
    getHostMeetingDurationSeconds(hostId),
    getTranslations('meet.public'),
  ]);
  return (
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="flex items-center gap-2 font-medium text-sm">
        <Clock className="size-4" />
        {t('duration_title')}
      </h2>
      <p className="font-semibold">
        {t('duration_value', { hours: seconds / 3600 })}
      </p>
      <p className="text-muted-foreground text-xs">{t('duration_hint')}</p>
      <p className="text-muted-foreground text-xs">{t('transcription_hint')}</p>
    </section>
  );
}
