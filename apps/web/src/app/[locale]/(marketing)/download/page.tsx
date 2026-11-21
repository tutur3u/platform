import { ShieldCheck } from '@tuturuuu/icons/lucide-static';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { HeroAtmosphere } from '@/components/landing/shared/atmosphere';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';
import { AppFamilies } from './app-families';
import { CliInstall } from './cli-install';
import { DownloadRuntime, DownloadSkeleton } from './download-runtime';
import { DESKTOP_RELEASES_URL, MOBILE_CHANGELOG_URL } from './release-links';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'desktop_download',
  pathname: '/download',
});

const footerLink =
  'rounded font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export default async function DownloadPage() {
  const t = await getTranslations('desktop_download');

  return (
    <main className="relative isolate w-full">
      <HeroAtmosphere />
      <div className="relative mx-auto w-full max-w-5xl px-4 py-12 sm:px-8 lg:py-20">
        <h1 className="text-balance font-display font-semibold text-4xl tracking-tight sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-muted-foreground">
          {t('description')}
        </p>
        <Suspense fallback={<DownloadSkeleton />}>
          <DownloadRuntime />
        </Suspense>
        <AppFamilies />
        <CliInstall />
        <footer className="mt-16 space-y-3 border-border/70 border-t pt-6 text-muted-foreground text-xs">
          <p className="flex items-start gap-2">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            {t('security')}
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <a
              href={DESKTOP_RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={footerLink}
            >
              {t('all_desktop_releases')}
              <span className="sr-only"> {t('opens_new_tab')}</span>
            </a>
            <a
              href={MOBILE_CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={footerLink}
            >
              {t('mobile_changelog')}
              <span className="sr-only"> {t('opens_new_tab')}</span>
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
