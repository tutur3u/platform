import SubmissionsListFallback from './fallback';
import SubmissionsList from './server-component';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    sortField?: string;
    sortDirection?: string;
    search?: string;
    challengeId?: string;
    problemId?: string;
  }>;
}) {
  const t = await getTranslations('nova');

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t('submissions')}</h1>
        <p className="text-muted-foreground mt-2">
          Manage and review user submissions
        </p>
      </div>

      <Suspense fallback={<SubmissionsListFallback />}>
        <SubmissionsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
