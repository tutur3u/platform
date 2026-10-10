import { ArrowRight, History } from '@tuturuuu/icons';
import { MeetingLocalTime } from '@tuturuuu/meet-core/features/call/components/meeting-local-time';
import type { listFacilitatedSessions } from '@tuturuuu/meet-core/parley/repository';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

type Session = Awaited<
  ReturnType<typeof listFacilitatedSessions>
>['sessions'][number];

export async function RecentSessions({
  sessions,
}: {
  sessions: Session[] | null;
}) {
  const t = await getTranslations('parley');
  return (
    <section className="space-y-4" aria-label={t('recent_sessions')}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-lg">
            <History className="size-5" aria-hidden />
            {t('recent_sessions')}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('recent_sessions_hint')}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/sessions">
            {t('view_all_sessions')}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </header>
      {sessions === null ? (
        <div className="rounded-xl border border-dashed p-5 text-muted-foreground text-sm">
          {t('recent_sessions_unavailable')}
        </div>
      ) : sessions.length ? (
        <div className="divide-y rounded-xl border bg-card">
          {sessions.slice(0, 3).map((session) => (
            <Link
              key={session.id}
              href={`/sessions/${session.id}`}
              className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{session.title}</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {session.category} ·{' '}
                  <MeetingLocalTime value={session.createdAt} pattern="PP p" />
                </p>
              </div>
              <span className="hidden text-muted-foreground text-sm sm:block">
                {t('review')}
              </span>
              <ArrowRight className="size-4 shrink-0" aria-hidden />
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-5">
          <p className="font-medium text-sm">{t('sessions_empty')}</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('sessions_empty_hint')}
          </p>
        </div>
      )}
    </section>
  );
}
