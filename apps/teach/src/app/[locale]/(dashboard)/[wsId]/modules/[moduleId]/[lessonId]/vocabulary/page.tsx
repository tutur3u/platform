import { ArrowLeft } from '@tuturuuu/icons';
import {
  getTulearnBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from '@/i18n/navigation';
import LessonVocabularySection from '../vocabulary-section';

export default async function LessonVocabularyPage({
  params,
}: {
  params: Promise<{
    lessonId: string;
    locale: string;
    moduleId: string;
    wsId: string;
  }>;
}) {
  const { lessonId, locale, moduleId, wsId } = await params;
  const requestHeaders = await headers();
  const authOptions = withForwardedInternalApiAuth(requestHeaders);

  const bootstrap = await getTulearnBootstrap(authOptions).catch(() => null);

  if (!bootstrap) {
    redirect({
      href: `/login?next=/${wsId}/modules/${moduleId}/${lessonId}/vocabulary`,
      locale,
    });
    throw new Error('Redirecting to Teach login');
  }

  const workspace = bootstrap.workspaces.find((item) => item.id === wsId);

  if (!workspace) {
    const fallbackId = bootstrap.workspaces[0]?.id;
    redirect({
      href: fallbackId ? `/${fallbackId}/modules` : '/dashboard',
      locale,
    });
    throw new Error('Workspace not found');
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            className="inline-flex items-center gap-2 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
            href={`/${locale}/${wsId}/modules/${moduleId}/${lessonId}`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to lesson
          </Link>

          <div>
            <p className="text-muted-foreground text-sm">{workspace.name}</p>
            <h1 className="font-black text-2xl">Lesson Vocabulary</h1>
          </div>
        </div>

        <LessonVocabularySection wsId={wsId} lessonId={lessonId} />
      </div>
    </main>
  );
}
