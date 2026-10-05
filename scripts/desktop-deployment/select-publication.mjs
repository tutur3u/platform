/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: CI publication input only */
import { appendFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DESKTOP_PLATFORMS, parsePlatforms } from './platforms.mjs';
import { verifyPublication } from './verify-publication.mjs';

export async function selectVerifiedPlatforms(
  directory,
  source,
  run,
  selected
) {
  const approved = parsePlatforms(selected);
  const files = await readdir(directory);
  const allowed = approved.flatMap((platform) => [
    DESKTOP_PLATFORMS[platform].name,
    `verified-${platform}.json`,
  ]);
  if (files.some((name) => !allowed.includes(name)))
    throw new Error('Unexpected desktop publication asset');
  const available = approved.filter(
    (platform) =>
      files.includes(DESKTOP_PLATFORMS[platform].name) ||
      files.includes(`verified-${platform}.json`)
  );
  if (!available.length)
    throw new Error('No verified desktop platform is available');
  // All present files must pass the existing exact receipt/source/hash gate.
  // A missing or invalid receipt never turns into a silently skipped platform.
  await verifyPublication(directory, source, run, available.join(','));
  return available;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const available = await selectVerifiedPlatforms(
    join(process.env.RUNNER_TEMP, 'desktop-artifacts'),
    process.env.GITHUB_SHA,
    process.env.GITHUB_RUN_ID,
    process.env.DESKTOP_BETA_PLATFORMS
  );
  await appendFile(
    process.env.GITHUB_ENV,
    `DESKTOP_BETA_PLATFORMS=${available.join(',')}\n`
  );
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `Publishing verified platforms: ${available.join(', ')}. Missing platform builds remain unavailable.\n`
  );
}
