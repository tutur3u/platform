import { ArrowLeft } from '@tuturuuu/icons';
import {
  getTeachBootstrap,
  getTulearnBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import LessonVocabularySection from '@/app/[locale]/(dashboard)/[wsId]/modules/[moduleId]/[lessonId]/vocabulary-section';
import { redirect } from '@/i18n/navigation';

interface Props {
  backHref: string;
  bootstrapSource: 'teach' | 'tulearn';
  fallbackHref: string;
  locale: string;
  loginNext: string;
  moduleId: string;
  wsId: string;
}

export async function LessonVocabularyPage({
  backHref,
  bootstrapSource,
  fallbackHref,
  locale,
  loginNext,
  moduleId,
  wsId,
}: Props) {
  const t = await getTranslations('teachVocabulary');
  const requestHeaders = await headers();
  const authOptions = withForwardedInternalApiAuth(requestHeaders);
  const bootstrap = await (bootstrapSource === 'teach'
    ? getTeachBootstrap(authOptions)
    : getTulearnBootstrap(authOptions)
  ).catch(() => null);

  if (!bootstrap) {
    return redirect({ href: `/login?next=${loginNext}`, locale });
  }

  const workspace = bootstrap.workspaces.find((item) => item.id === wsId);

  if (!workspace) {
    const fallbackId = bootstrap.workspaces[0]?.id;
    return redirect({
      href: fallbackId ? `/${fallbackId}/${fallbackHref}` : '/dashboard',
      locale,
    });
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            className="inline-flex items-center gap-2 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
            href={backHref}
          >
            <ArrowLeft className="h-4 w-4" />
            {t('backToLesson')}
          </Link>

          <div>
            <p className="text-muted-foreground text-sm">{workspace.name}</p>
            <h1 className="font-black text-2xl">{t('title')}</h1>
          </div>
        </div>

        <LessonVocabularySection wsId={wsId} moduleId={moduleId} />
      </div>
    </main>
  );
}
