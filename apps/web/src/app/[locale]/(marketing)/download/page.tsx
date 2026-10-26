import { ShieldCheck } from '@tuturuuu/icons/lucide-static';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { HeroAtmosphere } from '@/components/landing/shared/atmosphere';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';
import { DownloadRuntime, DownloadSkeleton } from './download-runtime';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'desktop_download',
  pathname: '/download',
});

export default async function DownloadPage() {
  const t = await getTranslations('desktop_download');

  return (
    <main className="relative isolate mx-auto w-full max-w-4xl px-4 py-12 sm:px-8 lg:py-20">
      <HeroAtmosphere />
      <div className="relative">
        <h1 className="text-balance font-display font-semibold text-4xl tracking-tight sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-muted-foreground">
          {t('description')}
        </p>
        <Suspense fallback={<DownloadSkeleton />}>
          <DownloadRuntime />
        </Suspense>
        <p className="mt-8 flex items-start gap-2 text-muted-foreground text-xs">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t('security')}
        </p>
      </div>
    </main>
  );
}
