import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { API_URL } from '@/constants/common';
import SharedFormContent from './content';

interface PageProps {
  params: Promise<{ shareCode: string }>;
}

export default async function SharedFormPage({ params }: PageProps) {
  const { shareCode } = await params;
  const t = await getTranslations('forms');
  const cookieStore = await cookies();
  const response = await fetch(`${API_URL}/v1/shared/forms/${shareCode}`, {
    cache: 'no-store',
    headers: {
      cookie: cookieStore.toString(),
    },
  });

  if (response.status === 401) {
    redirect(`/login?nextUrl=/shared/forms/${shareCode}`);
  }

  if (!response.ok) {
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

  const data = await response.json();

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
