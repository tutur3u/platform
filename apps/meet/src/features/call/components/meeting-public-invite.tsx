import { Calendar, LockKeyhole, Video } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { MeetingPublicInfo } from '../lib/meeting-public-info';
import { MeetingLocalTime } from './meeting-local-time';

export async function MeetingPublicInvite({
  info,
  returnTo,
}: {
  info: MeetingPublicInfo;
  returnTo: string;
}) {
  const t = await getTranslations('meet.public');
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <article className="w-full max-w-xl space-y-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Video className="size-5" />
          <span className="font-medium text-sm">Tuturuuu Meet</span>
        </div>
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            {info.ended ? t('ended') : t('invitation')}
          </p>
          <h1 className="break-words font-semibold text-3xl tracking-tight sm:text-4xl">
            {info.title}
          </h1>
          {Number.isFinite(Date.parse(info.scheduledAt)) && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Calendar className="size-4 shrink-0" />
              <MeetingLocalTime value={info.scheduledAt} pattern="PPP p z" />
            </div>
          )}
        </div>
        <div className="space-y-3">
          <Button asChild size="lg" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(returnTo)}`}>
              {t('sign_in')}
            </Link>
          </Button>
          <p className="flex items-start justify-center gap-2 text-muted-foreground text-xs">
            <LockKeyhole className="size-3.5 shrink-0" />
            {t('admission_hint')}
          </p>
        </div>
      </article>
    </main>
  );
}
