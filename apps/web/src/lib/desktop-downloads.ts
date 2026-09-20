export const DESKTOP_REPOSITORY = 'tutur3u/platform';
export const DESKTOP_ASSETS = {
  windows: 'Tuturuuu-windows-x64-setup.exe',
  macos: 'Tuturuuu-macos-universal.dmg',
  linux: 'Tuturuuu-linux-x64.deb',
} as const;

export type DesktopPlatform = keyof typeof DESKTOP_ASSETS;
export type DesktopDownload = {
  platform: DesktopPlatform;
  url: string;
  size: number;
  sha256: string;
};
export type DesktopRelease = {
  tag: string;
  url: string;
  downloads: DesktopDownload[];
};

const tagPattern = /^desktop-v\d+\.\d+\.\d+-\d+$/;
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

// Never turn arbitrary provider data into a redirect or download link. The
// release workflow publishes this exact asset set only after every OS passes.
export function parseDesktopRelease(value: unknown): DesktopRelease | null {
  const release = object(value);
  if (
    release?.draft !== false ||
    typeof release.tag_name !== 'string' ||
    !tagPattern.test(release.tag_name) ||
    !Array.isArray(release.assets)
  )
    return null;
  const tag = release.tag_name;
  const base = `https://github.com/${DESKTOP_REPOSITORY}/releases`;
  if (release.html_url !== `${base}/tag/${tag}`) return null;
  const downloads: DesktopDownload[] = [];
  for (const [platform, name] of Object.entries(DESKTOP_ASSETS)) {
    const matches = release.assets
      .map(object)
      .filter((asset) => asset?.name === name);
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
      platform: platform as DesktopPlatform,
      url,
      size: asset.size,
      sha256: asset.digest.slice(7),
    });
  }
  return { tag, url: `${base}/tag/${tag}`, downloads };
}

export function findDesktopRelease(value: unknown): DesktopRelease | null {
  if (!Array.isArray(value)) return null;
  return (
    value.map(parseDesktopRelease).find((release) => release !== null) ?? null
  );
}
