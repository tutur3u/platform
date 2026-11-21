import 'server-only';
import { getTranslations } from 'next-intl/server';
import type {
  BetaReleaseStatus,
  BetaReleaseStatuses,
} from '@/lib/app-release-status';
import { DESKTOP_PACKAGES, type DesktopRelease } from '@/lib/desktop-downloads';
import {
  type DownloadPlatform,
  parseDesktopTag,
  type ReleaseVersion,
} from '@/lib/download-platform';
import type { MobileStoreListings } from '@/lib/mobile-store-listings';
import type {
  DownloadAction,
  DownloadLabels,
  DownloadOption,
} from './download-option';
import { MOBILE_CHANGELOG_URL } from './release-links';

export async function buildDownloadContent(
  desktop: DesktopRelease | null,
  mobile: MobileStoreListings,
  betaStatus: BetaReleaseStatuses
): Promise<{
  labels: DownloadLabels;
  options: Record<DownloadPlatform, DownloadOption>;
}> {
  const t = await getTranslations('desktop_download');
  const labels: DownloadLabels = {
    recommended: t('recommended'),
    others: t('other_title'),
    beta: t('beta_badge'),
    checksum: t('checksum'),
    details: t('details'),
    newTab: t('opens_new_tab'),
    qrTitle: t('qr.title'),
    qrDescription: t('qr.description'),
    qrCodeLabel: t('qr.label'),
    unavailable: t('coming_soon'),
  };
  const versionLabel = ({ version, build }: ReleaseVersion) =>
    build ? t('version_build', { version, build }) : t('version', { version });
  // The pipeline note is shown verbatim after the localized version.
  const statusLabel = (status: BetaReleaseStatus) => {
    const label = versionLabel({
      version: status.version,
      build: String(status.build),
    });
    return status.note ? `${label} · ${status.note}` : label;
  };
  const version = (release: ReleaseVersion | null) =>
    release ? [versionLabel(release)] : [];
  const requestAccess: DownloadAction = {
    href: '/contact',
    label: t('request_access'),
    external: false,
  };
  const mobileChangelog: DownloadAction = {
    href: MOBILE_CHANGELOG_URL,
    label: t('changelog'),
    external: true,
  };

  const mobileOption = (platform: 'ios' | 'android'): DownloadOption => {
    const { store, betaUrl } = mobile[platform];
    // A beta is offered only once the store pipeline has verified a build.
    const status = betaStatus[platform];
    const name = t(`${platform}.name`);
    const base = {
      platform,
      name,
      title: t('primary_title', { platform: name }),
      requirements: t(`${platform}.requirements`),
    };
    const betaJoin =
      status && betaUrl
        ? {
            href: betaUrl,
            label: t(`${platform}.beta_action`),
            shortLabel: t('join_beta'),
            external: true,
          }
        : undefined;

    if (store)
      return {
        ...base,
        beta: false,
        meta: [...version(store.release), t(`${platform}.store_meta`)],
        action: {
          href: store.url,
          label: t(`${platform}.store_action`),
          shortLabel: t('get_app'),
          external: true,
        },
        betaAction: betaJoin && {
          ...betaJoin,
          label: status
            ? t('beta_opt_in_version', { version: statusLabel(status) })
            : t('beta_opt_in'),
        },
        releaseNotes: mobileChangelog,
      };
    if (status)
      return {
        ...base,
        beta: true,
        meta: [statusLabel(status), t(`${platform}.beta_meta`)],
        action: betaJoin ?? requestAccess,
        note: betaJoin ? t('mobile_invite') : undefined,
        noteLink: betaJoin ? requestAccess : undefined,
        releaseNotes: mobileChangelog,
      };
    return {
      ...base,
      beta: false,
      meta: [t('invite_only')],
      action: requestAccess,
    };
  };

  // The verified status, with its note, wins when it describes the same build.
  const desktopVersionLabel = (tag: string) => {
    const release = parseDesktopTag(tag);
    const status = betaStatus.desktop;
    return status &&
      status.version === release.version &&
      String(status.build) === release.build
      ? statusLabel(status)
      : versionLabel(release);
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
      beta: Boolean(download),
      requirements: t(`${platform}.requirements`, {
        version: download?.minimumOs ?? DESKTOP_PACKAGES[platform].minimumOs,
      }),
      architecture: download?.architecture,
      meta: download
        ? [
            desktopVersionLabel(download.tag),
            t('size', { size: Math.ceil(download.size / 1024 / 1024) }),
          ]
        : [],
      action: download
        ? {
            href: download.url,
            label: t('download_for', { platform: name }),
            shortLabel: t('download_beta'),
            external: false,
          }
        : null,
      note: download
        ? platform === 'windows'
          ? [
              t(
                download.unsigned
                  ? 'windows.unsigned'
                  : 'windows.may_be_unsigned'
              ),
              t('windows.installation'),
              t('windows.legacy_update'),
            ].join(' ')
          : t(`${platform}.installation`)
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
      beta: false,
      meta: [t('web.meta')],
      requirements: t('web.requirements'),
      action: {
        href: '/login',
        label: t('web.action'),
        shortLabel: t('web.short_action'),
        external: false,
      },
    },
  };
  return { labels, options };
}
