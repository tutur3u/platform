import { MeetTogetherPage } from '@tuturuuu/ui/legacy/tumeet/page';
import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import type { Locale } from '@/i18n/routing';

interface TumeetPageProps {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
  }>;
}

export default async function TumeetPage({
  params,
  searchParams,
}: TumeetPageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return (
    <Suspense>
      <MeetTogetherPage searchParams={searchParams} path="" />
    </Suspense>
  );
}
