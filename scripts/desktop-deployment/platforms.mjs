/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: standalone CI-only scripts never run in Turbo or cache release inputs */
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const DESKTOP_PLATFORMS = {
  windows: { runner: 'windows-latest', name: 'Tuturuuu-windows-x64-setup.exe' },
  macos: { runner: 'macos-latest', name: 'Tuturuuu-macos-universal.dmg' },
  linux: { runner: 'ubuntu-24.04', name: 'Tuturuuu-linux-x64.deb' },
};

export function parsePlatforms(value = 'windows,macos,linux') {
  const platforms = value.split(',');
  if (
    !platforms.length ||
    new Set(platforms).size !== platforms.length ||
    platforms.some((platform) => !Object.hasOwn(DESKTOP_PLATFORMS, platform))
  ) {
    throw new Error(
      'Desktop platforms must be a unique, nonempty allowlisted set'
    );
  }
  return platforms;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const platforms = parsePlatforms(
    process.env.DESKTOP_BETA_PLATFORMS || undefined
  );
  const matrix = {
    include: platforms.map((platform) => ({
      platform,
      runner: DESKTOP_PLATFORMS[platform].runner,
    })),
  };
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `platforms=${platforms.join(',')}\nmatrix=${JSON.stringify(matrix)}\n`
  );
}
