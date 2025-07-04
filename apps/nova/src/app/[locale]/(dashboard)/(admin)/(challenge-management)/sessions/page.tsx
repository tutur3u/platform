import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import SessionsListFallback from './fallback';
import SessionsList from './server-component';

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
    status?: string;
  }>;
}) {
  const t = await getTranslations('nova.submission-page');

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('description')}</p>
      </div>

      <Suspense fallback={<SessionsListFallback />}>
        <SessionsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
