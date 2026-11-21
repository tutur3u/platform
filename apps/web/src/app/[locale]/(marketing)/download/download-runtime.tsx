import { headers } from 'next/headers';
import { connection } from 'next/server';
import { getLocale } from 'next-intl/server';
import { siteConfig } from '@/constants/configs';
import { defaultLocale } from '@/i18n/routing';
import { getBetaReleaseStatuses } from '@/lib/app-release-status.server';
import { getDesktopRelease } from '@/lib/desktop-downloads.server';
import { detectPlatform } from '@/lib/download-platform';
import { getMobileStoreListings } from '@/lib/mobile-store-listings.server';
import { buildDownloadContent } from './build-download-options';
import { DownloadChooser } from './download-chooser';

export async function DownloadRuntime() {
  await connection();
  const [requestHeaders, locale, desktop, mobile, betaStatus] =
    await Promise.all([
      headers(),
      getLocale(),
      getDesktopRelease(),
      getMobileStoreListings(),
      getBetaReleaseStatuses(),
    ]);
  const { labels, options } = await buildDownloadContent(
    desktop,
    mobile,
    betaStatus
  );
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

// Mirrors the rendered layout: the recommended card (with the QR panel on
// wide screens), then the platform card grid.
export function DownloadSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mt-10 h-[19rem] animate-pulse rounded-3xl border border-border/70 bg-muted/40 sm:h-[20rem]" />
      <div className="mt-12 h-5 w-32 rounded bg-muted/60" />
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }, (_, index) => (
          <li
            key={`platform-skeleton-${index}`}
            className="h-44 animate-pulse rounded-2xl border border-border/70 bg-muted/40"
          />
        ))}
      </ul>
    </div>
  );
}
