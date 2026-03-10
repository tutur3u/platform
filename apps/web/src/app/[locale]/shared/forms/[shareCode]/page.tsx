import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import SharedFormContent from './content';
import {
  buildSharedFormMetadata,
  fetchSharedFormData,
} from './shared-form-data';

interface PageProps {
  params: Promise<{ locale: string; shareCode: string }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale, shareCode } = await params;
  const t = await getTranslations('forms');
  const cookieStore = await cookies();
  const { status, data } = await fetchSharedFormData(shareCode, {
    cookieHeader: cookieStore.toString(),
  });

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
  const cookieStore = await cookies();
  const { status, data } = await fetchSharedFormData(shareCode, {
    cookieHeader: cookieStore.toString(),
  });

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
    />
  );
}
