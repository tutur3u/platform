'use client';
import type { ProgrammingProblemSummary } from '@tuturuuu/types/primitives/programming';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/** Server-authorized DTOs and capabilities only; this component grants no access. */
export function ProgrammingCatalog({
  wsId,
  locale,
  author,
  canAuthor,
  studentId,
  problems,
  nextCursor,
}: {
  wsId: string;
  locale: string;
  author: boolean;
  canAuthor: boolean;
  studentId?: string;
  problems: ProgrammingProblemSummary[];
  nextCursor: string | null;
}) {
  const t = useTranslations('programming');
  const mode = author ? 'author' : 'learner';
  const suffix = author
    ? '?mode=author'
    : studentId
      ? `?studentId=${encodeURIComponent(studentId)}`
      : '';
  return (
    <section className="w-full space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl">{t('title')}</h1>
        <Button asChild variant="outline">
          <Link href={`/${wsId}/programming/playgrounds`}>
            {t('playgrounds')}
          </Link>
        </Button>
        {author ? (
          <Button asChild>
            <Link href={`/${wsId}/programming/problems/new`}>
              {t('create')}
            </Link>
          </Button>
        ) : canAuthor ? (
          <Button asChild variant="outline">
            <Link href={`/${wsId}/programming?mode=author`}>
              {t('authorCatalog')}
            </Link>
          </Button>
        ) : null}
      </header>
      {!problems.length ? (
        <p className="rounded-lg border p-6 text-muted-foreground">
          {t('emptyCatalog')}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {problems.map((problem) => (
            <Card key={problem.id}>
              <CardHeader>
                <CardTitle>
                  {problem.title[locale === 'vi' ? 'vi' : 'en']}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link
                    href={`/${wsId}/programming/problems/${problem.id}${suffix}`}
                  >
                    {t('open')}
                  </Link>
                </Button>
                {author && problem.editable && (
                  <Button asChild variant="ghost">
                    <Link
                      href={`/${wsId}/programming/problems/${problem.id}/edit`}
                    >
                      {t('edit')}
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {nextCursor && (
        <Button asChild variant="outline">
          <Link
            href={`/${wsId}/programming?mode=${mode}${studentId ? `&studentId=${encodeURIComponent(studentId)}` : ''}&cursor=${encodeURIComponent(nextCursor)}`}
          >
            {t('nextPage')}
          </Link>
        </Button>
      )}
    </section>
  );
}
