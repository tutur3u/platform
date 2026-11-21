export const DESKTOP_REPOSITORY = 'tutur3u/platform';
export const DESKTOP_PLATFORMS = ['windows', 'macos', 'linux'] as const;
export const DESKTOP_PACKAGES = {
  windows: {
    name: 'Tuturuuu-windows-x64-setup.exe',
    architecture: 'x64',
    minimumOs: '10',
  },
  macos: {
    name: 'Tuturuuu-macos-universal.dmg',
    architecture: 'universal',
    minimumOs: '12',
  },
  linux: {
    name: 'Tuturuuu-linux-x64.deb',
    architecture: 'x64',
    minimumOs: '24.04',
  },
} as const;

export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];
export type DesktopPackageArchitecture =
  (typeof DESKTOP_PACKAGES)[DesktopPlatform]['architecture'];
export type DesktopDownload = {
  platform: DesktopPlatform;
  architecture: DesktopPackageArchitecture;
  minimumOs: string;
  unsigned: boolean;
  tag: string;
  releaseUrl: string;
  url: string;
  size: number | null;
  sha256: string;
};
export type DesktopRelease = {
  tag: string;
  url: string;
  downloads: DesktopDownload[];
};

// Tags are desktop-v<version>-<build> on the shared release train. Older
// betas used desktop-v<version> or appended the CI run ID.
export const DESKTOP_TAG_PATTERN = /^desktop-v\d+\.\d+\.\d+(?:-\d+)?$/;
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

// Never turn arbitrary provider data into a redirect or download link. The
// release workflow publishes only packages that pass their platform checks.
export function parseDesktopRelease(value: unknown): DesktopRelease | null {
  const release = object(value);
  if (
    release?.draft !== false ||
    release.prerelease !== true ||
    typeof release.tag_name !== 'string' ||
    !DESKTOP_TAG_PATTERN.test(release.tag_name) ||
    !Array.isArray(release.assets)
  )
    return null;
  const tag = release.tag_name;
  const base = `https://github.com/${DESKTOP_REPOSITORY}/releases`;
  if (release.html_url !== `${base}/tag/${tag}`) return null;
  const downloads: DesktopDownload[] = [];
  for (const platform of DESKTOP_PLATFORMS) {
    const { name, architecture, minimumOs } = DESKTOP_PACKAGES[platform];
    const matches = release.assets
      .map(object)
      .filter((asset) => asset?.name === name);
    if (matches.length === 0) continue;
    if (matches.length !== 1) return null;
    const asset = matches[0];
    const url = `${base}/download/${tag}/${name}`;
    if (
      asset?.state !== 'uploaded' ||
      asset.browser_download_url !== url ||
      typeof asset.size !== 'number' ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      typeof asset.digest !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
    )
      return null;
    downloads.push({
      platform,
      architecture,
      minimumOs,
      unsigned:
        platform === 'windows' &&
        typeof release.body === 'string' &&
        /^- Windows packages are UNSIGNED for now\./m.test(release.body),
      tag,
      releaseUrl: `${base}/tag/${tag}`,
      url,
      size: asset.size,
      sha256: asset.digest.slice(7),
    });
  }
  if (downloads.length === 0 || release.assets.length !== downloads.length)
    return null;
  return { tag, url: `${base}/tag/${tag}`, downloads };
}

export function findDesktopRelease(value: unknown): DesktopRelease | null {
  if (!Array.isArray(value)) return null;
  const releases = value
    .map(parseDesktopRelease)
    .filter((release) => release !== null);
  const latest = releases[0];
  if (!latest) return null;
  const platforms = new Map<DesktopPlatform, DesktopDownload>();
  for (const release of releases) {
    for (const download of release.downloads) {
      if (!platforms.has(download.platform))
        platforms.set(download.platform, download);
    }
  }
  return { ...latest, downloads: [...platforms.values()] };
}
