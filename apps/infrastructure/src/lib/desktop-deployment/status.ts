export const DESKTOP_REPO = 'tutur3u/platform';
export const DESKTOP_WORKFLOW = '.github/workflows/desktop-beta.yaml';
export const DESKTOP_PLATFORMS = ['windows', 'macos', 'linux'] as const;
const assets = {
  windows: 'Tuturuuu-windows-x64-setup.exe',
  macos: 'Tuturuuu-macos-universal.dmg',
  linux: 'Tuturuuu-linux-x64.deb',
};
const states = new Set(['queued', 'in_progress', 'completed']);
const conclusions = new Set([
  'success',
  'failure',
  'cancelled',
  'skipped',
  'neutral',
  'timed_out',
  'action_required',
  'stale',
  'startup_failure',
]);
const sha = /^[a-f0-9]{40}$/;
const tag = /^desktop-v\d+\.\d+\.\d+-\d+$/;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseDesktopRun(value: unknown) {
  if (
    !record(value) ||
    !Number.isSafeInteger(value.id) ||
    (value.id as number) <= 0 ||
    value.head_branch !== 'production' ||
    value.path !== DESKTOP_WORKFLOW ||
    typeof value.head_sha !== 'string' ||
    !sha.test(value.head_sha) ||
    typeof value.status !== 'string' ||
    !states.has(value.status) ||
    (value.conclusion !== null &&
      (typeof value.conclusion !== 'string' ||
        !conclusions.has(value.conclusion)))
  )
    return null;
  return {
    id: value.id as number,
    source: value.head_sha,
    status: value.status,
    conclusion: value.conclusion as string | null,
    url: `https://github.com/${DESKTOP_REPO}/actions/runs/${value.id}`,
  };
}

export function parseDesktopPackages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return DESKTOP_PLATFORMS.flatMap((platform) => {
    for (const release of value) {
      if (
        !record(release) ||
        release.draft !== false ||
        release.prerelease !== true ||
        typeof release.tag_name !== 'string' ||
        !tag.test(release.tag_name) ||
        !Array.isArray(release.assets)
      )
        continue;
      const matching = release.assets.filter(
        (asset) => record(asset) && asset.name === assets[platform]
      );
      if (matching.length !== 1) continue;
      const asset = matching[0];
      if (
        !record(asset) ||
        asset.state !== 'uploaded' ||
        !Number.isSafeInteger(asset.size) ||
        (asset.size as number) <= 0 ||
        typeof asset.digest !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
      )
        continue;
      const url = `https://github.com/${DESKTOP_REPO}/releases/download/${release.tag_name}/${assets[platform]}`;
      if (
        asset.browser_download_url !== url ||
        release.html_url !==
          `https://github.com/${DESKTOP_REPO}/releases/tag/${release.tag_name}`
      )
        continue;
      return [
        {
          platform,
          tag: release.tag_name,
          size: asset.size as number,
          digest: asset.digest.slice(7),
          url,
          releaseUrl: release.html_url as string,
        },
      ];
    }
    return [];
  });
}

export function parseDesktopJobs(value: unknown) {
  if (!record(value) || !Array.isArray(value.jobs)) return [];
  return value.jobs.flatMap((job) => {
    if (
      !record(job) ||
      typeof job.name !== 'string' ||
      typeof job.status !== 'string' ||
      !states.has(job.status) ||
      (job.conclusion !== null &&
        (typeof job.conclusion !== 'string' ||
          !conclusions.has(job.conclusion)))
    )
      return [];
    const verification = Array.isArray(job.steps)
      ? job.steps.find(
          (step) =>
            record(step) && step.name === 'Verify signed beta provenance'
        )
      : undefined;
    return [
      {
        name: job.name,
        status: job.status,
        conclusion: job.conclusion as string | null,
        provenanceVerified:
          record(verification) && verification.conclusion === 'success',
      },
    ];
  });
}
