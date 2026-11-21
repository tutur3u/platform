const REPOSITORY = 'tutur3u/platform';
const RELEASES = `https://github.com/${REPOSITORY}/releases`;
const PACKAGES = new Set([
  'Tuturuuu-macos-universal.dmg',
  'Tuturuuu-windows-x64-setup.exe',
  'Tuturuuu-linux-x64.deb',
]);

export async function readDesktopManifest(request, { version, build, sha }) {
  const tag = `desktop-v${version}-${build}`;
  const release = await request(`/repos/${REPOSITORY}/releases/tags/${tag}`);
  if (
    release?.tag_name !== tag ||
    release.target_commitish !== sha ||
    release.draft !== false ||
    release.prerelease !== true ||
    release.html_url !== `${RELEASES}/tag/${tag}` ||
    !Array.isArray(release.assets) ||
    !release.assets.length
  ) {
    throw new Error('Desktop manifest has no matching published prerelease');
  }
  const names = new Set();
  const assets = release.assets.map((asset) => {
    if (
      !PACKAGES.has(asset?.name) ||
      names.has(asset.name) ||
      asset.state !== 'uploaded' ||
      asset.browser_download_url !==
        `${RELEASES}/download/${tag}/${asset.name}` ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      !/^sha256:[a-f0-9]{64}$/u.test(asset.digest ?? '')
    ) {
      throw new Error('Desktop manifest contains an unverified package');
    }
    names.add(asset.name);
    return {
      name: asset.name,
      state: asset.state,
      browser_download_url: asset.browser_download_url,
      size: asset.size,
      digest: asset.digest,
    };
  });
  return {
    tag_name: tag,
    draft: false,
    prerelease: true,
    html_url: release.html_url,
    body: /^- Windows packages are UNSIGNED for now\./mu.test(
      release.body ?? ''
    )
      ? '- Windows packages are UNSIGNED for now.'
      : '',
    assets,
  };
}

export function addsDesktopManifestAssets(current, target) {
  if (
    target.platform !== 'desktop' ||
    current.version !== target.version ||
    current.sha !== target.sha ||
    !Array.isArray(target.desktopRelease?.assets)
  )
    return false;
  const previous = current.desktopRelease?.assets;
  if (!Array.isArray(previous)) return true;
  const next = target.desktopRelease.assets;
  return (
    next.length > previous.length &&
    previous.every((asset) =>
      next.some(
        (item) => item.name === asset?.name && item.digest === asset.digest
      )
    )
  );
}
