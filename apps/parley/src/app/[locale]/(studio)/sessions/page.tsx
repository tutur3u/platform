import { ArrowRight, History } from '@tuturuuu/icons';
import { MeetingLocalTime } from '@tuturuuu/meet-core/features/call/components/meeting-local-time';
import { requireParleyUser } from '@tuturuuu/meet-core/parley/authorization';
import { listFacilitatedSessions } from '@tuturuuu/meet-core/parley/repository';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
export default async function Sessions({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await connection();
  const user = await requireParleyUser();
  const page = Math.min(
    10000,
    Math.max(0, Number.parseInt((await searchParams).page ?? '0', 10) || 0)
  );
  const [{ sessions, hasMore }, t] = await Promise.all([
    listFacilitatedSessions(user.id, page),
    getTranslations('parley'),
  ]);
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-semibold text-3xl tracking-tight">
            {t('sessions')}
          </h1>
          <p className="text-muted-foreground">{t('sessions_hint')}</p>
        </div>
        <Button asChild>
          <Link href="/sessions/new">{t('new_session')}</Link>
        </Button>
      </header>
      {!sessions.length ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <History className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h2 className="font-semibold text-lg">{t('sessions_empty')}</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            {t('sessions_empty_hint')}
          </p>
          <Button asChild className="mt-5">
            <Link href="/sessions/new">{t('new_session')}</Link>
          </Button>
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/sessions/${session.id}`}
              className="flex items-center gap-4 p-5 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs">
                  {session.category} ·{' '}
                  {t('revision', { revision: session.revision })}
                </p>
                <h2 className="mt-1 truncate font-semibold">{session.title}</h2>
                <p className="mt-2 text-muted-foreground text-sm">
                  <MeetingLocalTime value={session.createdAt} pattern="PPP p" />
                </p>
              </div>
              <span className="hidden text-sm sm:block">{t('review')}</span>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          ))}
        </div>
      )}
      <nav aria-label={t('pagination')} className="flex justify-between gap-3">
        {page > 0 ? (
          <Button asChild variant="outline">
            <Link href={`/sessions?page=${page - 1}`}>{t('previous')}</Link>
          </Button>
        ) : (
          <span />
        )}
        {hasMore && (
          <Button asChild variant="outline">
            <Link href={`/sessions?page=${page + 1}`}>{t('next')}</Link>
          </Button>
        )}
      </nav>
    </>
  );
}
