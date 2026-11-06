import 'server-only';
import { getTranslations } from 'next-intl/server';
import type { DesktopRelease } from '@/lib/desktop-downloads';
import {
  type DownloadPlatform,
  desktopDisplayVersion,
} from '@/lib/download-platform';
import type { MobileStoreListings } from '@/lib/mobile-store-listings.server';
import type { DownloadLabels, DownloadOption } from './download-option';

export async function buildDownloadContent(
  desktop: DesktopRelease | null,
  mobile: MobileStoreListings
): Promise<{
  labels: DownloadLabels;
  options: Record<DownloadPlatform, DownloadOption>;
}> {
  const t = await getTranslations('desktop_download');
  const labels: DownloadLabels = {
    recommended: t('recommended'),
    others: t('other_title'),
    checksum: t('checksum'),
    details: t('details'),
    newTab: t('opens_new_tab'),
    qrTitle: t('qr.title'),
    qrDescription: t('qr.description'),
    qrCodeLabel: t('qr.label'),
    unavailable: t('coming_soon'),
  };
  const version = (value: string | null) =>
    value ? [t('version', { version: value })] : [];
  const requestAccess = {
    href: '/contact',
    label: t('request_access'),
    external: false,
  };

  const mobileOption = (platform: 'ios' | 'android'): DownloadOption => {
    const listing = mobile[platform];
    const name = t(`${platform}.name`);
    return {
      platform,
      name,
      title: t('primary_title', { platform: name }),
      meta: listing
        ? [...version(listing.version), t(`${platform}.${listing.kind}_meta`)]
        : [t('invite_only')],
      action: listing
        ? {
            href: listing.url,
            label: t(`${platform}.${listing.kind}_action`),
            external: true,
          }
        : requestAccess,
      note: listing?.kind === 'beta' ? t('mobile_invite') : undefined,
      noteLink: listing?.kind === 'beta' ? requestAccess : undefined,
    };
  };

  const desktopOption = (
    platform: 'macos' | 'windows' | 'linux'
  ): DownloadOption => {
    const download = desktop?.downloads.find(
      (item) => item.platform === platform
    );
    const name = t(`${platform}.name`);
    return {
      platform,
      name,
      title: t('primary_title', { platform: name }),
      meta: download
        ? [
            t('version', { version: desktopDisplayVersion(download.tag) }),
            t('size', { size: Math.ceil(download.size / 1024 / 1024) }),
            t(`${platform}.requirements`),
          ]
        : [t('coming_soon')],
      action: download
        ? {
            href: download.url,
            label: t('download_for', { platform: name }),
            shortLabel: t('download'),
            external: false,
          }
        : null,
      note:
        download && platform === 'windows'
          ? t('windows.installation')
          : undefined,
      releaseNotes: download
        ? {
            href: download.releaseUrl,
            label: t('release_notes'),
            external: true,
          }
        : undefined,
      sha256: download?.sha256,
    };
  };

  const options: Record<DownloadPlatform, DownloadOption> = {
    ios: mobileOption('ios'),
    android: mobileOption('android'),
    macos: desktopOption('macos'),
    windows: desktopOption('windows'),
    linux: desktopOption('linux'),
    web: {
      platform: 'web',
      name: t('web.name'),
      title: t('web.title'),
      meta: [t('web.meta')],
      action: { href: '/login', label: t('web.action'), external: false },
    },
  };
  return { labels, options };
}
