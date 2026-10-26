import { headers } from 'next/headers';
import { connection } from 'next/server';
import { getLocale } from 'next-intl/server';
import { siteConfig } from '@/constants/configs';
import { defaultLocale } from '@/i18n/routing';
import { getDesktopRelease } from '@/lib/desktop-downloads.server';
import { detectPlatform } from '@/lib/download-platform';
import { getMobileStoreListings } from '@/lib/mobile-store-listings.server';
import { buildDownloadContent } from './build-download-options';
import { DownloadChooser } from './download-chooser';

export async function DownloadRuntime() {
  await connection();
  const [requestHeaders, locale, desktop, mobile] = await Promise.all([
    headers(),
    getLocale(),
    getDesktopRelease(),
    getMobileStoreListings(),
  ]);
  const { labels, options } = await buildDownloadContent(desktop, mobile);
  // Phones scanning the code land on this page, which then leads with their
  // store, so one code serves both platforms.
  const qrUrl = new URL(
    locale === defaultLocale ? '/download' : `/${locale}/download`,
    siteConfig.url
  ).toString();

  return (
    <DownloadChooser
      detected={detectPlatform(requestHeaders.get('user-agent'))}
      options={options}
      labels={labels}
      qrUrl={qrUrl}
    />
  );
}

// Heights match the rendered cards (measured at 390 and 1440 px).
export function DownloadSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mt-10 h-[17rem] animate-pulse rounded-3xl border border-border/70 bg-muted/40 sm:h-[18.5rem]" />
      <div className="mt-12 h-5 w-32 rounded bg-muted/60" />
      <div className="mt-3 h-[32rem] animate-pulse rounded-2xl border border-border/70 bg-muted/40 sm:h-96" />
    </div>
  );
}
