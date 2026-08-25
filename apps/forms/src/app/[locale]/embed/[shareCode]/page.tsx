import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { EmbedContent } from '@/features/forms/embed/embed-content';
import { EmbedFrame } from '@/features/forms/embed/embed-frame';
import { loadSharedFormForPage } from '@/features/forms/shared-form-loader';

interface PageProps {
  params: Promise<{ locale: string; shareCode: string }>;
}

/**
 * An embed is a duplicate of the canonical `/f/<shareCode>` page, so it is
 * always `noindex`: two indexable URLs for the same form would compete with
 * each other, and the version without page chrome is the wrong one to rank.
 */
export function generateMetadata(): Metadata {
  return { robots: NO_INDEX_ROBOTS };
}

/**
 * Chrome-less form for embedding in a third-party page.
 *
 * Framing is denied platform-wide; this route is opted out through
 * `framablePathPatterns` in `next.config.ts`, which removes the deny headers
 * for `/embed/*` only. Everything else in the app stays unframable.
 */
export default async function EmbeddedFormPage({ params }: PageProps) {
  // Reads the respondent's session cookie to restore in-progress answers.
  await connection();

  const { shareCode } = await params;
  const t = await getTranslations('forms');
  const { status, data } = await loadSharedFormForPage(shareCode);

  // A form requiring sign-in cannot complete an auth round trip inside someone
  // else's iframe, so send the respondent to the hosted page in a new context
  // rather than trapping them in a frame that can never authenticate.
  if (status === 401) {
    redirect(`/f/${shareCode}`);
  }

  // The unavailable state is wrapped too, not just the happy path: without a
  // resize message the host iframe keeps its default height and the visitor
  // sees a short notice floating in a tall empty box.
  if (!data) {
    return (
      <EmbedFrame shareCode={shareCode}>
        <div className="flex items-center justify-center px-4 py-10">
          <div className="max-w-sm space-y-2 text-center">
            <h1 className="font-semibold text-lg">
              {t('shared.unavailable_title')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t('shared.unavailable_description')}
            </p>
          </div>
        </div>
      </EmbedFrame>
    );
  }

  return <EmbedContent data={data} shareCode={shareCode} />;
}
