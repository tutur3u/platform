import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import SharedFormContent from './content';
import { buildSharedFormMetadata } from './shared-form-data';
import {
  loadSharedFormForPage,
  loadSharedFormSnapshot,
} from './shared-form-loader';

interface PageProps {
  params: Promise<{ locale: string; shareCode: string }>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale, shareCode } = await params;
  const t = await getTranslations('forms');
  const { status, data } = await loadSharedFormSnapshot(shareCode);

  return buildSharedFormMetadata({
    locale,
    shareCode,
    form: data?.form,
    status,
    strings: {
      brand: t('brand'),
      fallbackTitle: t('shared.metadata_fallback_title'),
      fallbackDescription: t('shared.metadata_fallback_description'),
      protectedDescription: t('shared.metadata_protected_description'),
      unavailableDescription: t('shared.unavailable_description'),
      openGraphAlt: t('shared.open_graph_alt', {
        title: data?.form?.title || t('shared.metadata_fallback_title'),
      }),
    },
  });
}

export default async function SharedFormPage({ params }: PageProps) {
  const { shareCode } = await params;
  const t = await getTranslations('forms');
  const { status, data } = await loadSharedFormForPage(shareCode);

  if (status === 401) {
    redirect(`/login?nextUrl=/shared/forms/${shareCode}`);
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-background via-dynamic-green/5 to-dynamic-blue/10 px-4">
        <div className="max-w-lg space-y-3 text-center">
          <h1 className="font-semibold text-3xl">
            {t('shared.unavailable_title')}
          </h1>
          <p className="text-muted-foreground">
            {t('shared.unavailable_description')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <SharedFormContent
      form={data.form}
      shareCode={shareCode}
      sessionId={data.sessionId}
      readOnly={data.readOnly}
      initialAnswers={data.initialAnswers}
      answerIssues={data.answerIssues}
      submittedAt={data.submittedAt}
      responseCopyEmail={data.responseCopyEmail}
      readOnlyResponseId={data.readOnlyResponseId}
      readOnlyResponseSessionId={data.readOnlyResponseSessionId}
      canRequestResponseCopy={data.canRequestResponseCopy}
      responseCopyAlreadySent={data.responseCopyAlreadySent}
    />
  );
}
