/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: standalone CI-only scripts never run in Turbo or cache release inputs */
import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readDraftRelease, verifyDraftRelease } from './draft-release.mjs';
import { changesSince, renderDesktopReleaseNotes } from './release-notes.mjs';
import {
  desktopBuildVersion,
  desktopReleaseTag,
  listDesktopReleases,
  nextDesktopVersion,
} from './release-version.mjs';
import { verifyPublication } from './verify-publication.mjs';

if (
  process.env.GITHUB_REF !== 'refs/heads/production' ||
  process.env.GITHUB_REPOSITORY !== 'tutur3u/platform'
) {
  throw new Error(
    'Desktop releases must originate from production in tutur3u/platform'
  );
}
const directory = join(process.env.RUNNER_TEMP, 'desktop-artifacts');
const files = await verifyPublication(
  directory,
  process.env.GITHUB_SHA,
  process.env.GITHUB_RUN_ID,
  process.env.DESKTOP_BETA_PLATFORMS
);
if (!process.env.DESKTOP_VERSION)
  throw new Error('Desktop release version must come from the build job');
const pubspec = await readFile('apps/mobile/pubspec.yaml', 'utf8');
const version = desktopBuildVersion(pubspec, process.env.DESKTOP_VERSION);
// The build embedded this version; publish only if it is still the next one.
// A draft left by a failed run reserves its version and stops this run.
const releases = listDesktopReleases();
if (
  nextDesktopVersion(
    pubspec,
    releases.map(({ tag }) => tag)
  ) !== version
)
  throw new Error(
    `Desktop version ${version} is no longer the next unused version; inspect existing desktop releases before rerunning`
  );
const tag = desktopReleaseTag(version);
const previous = releases.find(({ draft }) => !draft);
const sized = await Promise.all(
  files.map(async (file) => ({
    ...file,
    size: (await stat(join(directory, file.name))).size,
  }))
);
const notes = join(process.env.RUNNER_TEMP, 'desktop-release-notes.md');
await writeFile(
  notes,
  renderDesktopReleaseNotes({
    version,
    source: process.env.GITHUB_SHA,
    run: process.env.GITHUB_RUN_ID,
    files: sized,
    changes: changesSince(previous?.source, process.env.GITHUB_SHA),
    previous: previous && {
      ...previous,
      legacy: /-\d+$/u.test(previous.tag),
    },
  })
);
// Publish as a draft first. No partially uploaded release appears on /download.
// No --clobber: immutable release tags cannot silently replace an installed build.
const gh = (args) => execFileSync('gh', args, { stdio: 'inherit' });
gh([
  'release',
  'create',
  tag,
  '--repo',
  'tutur3u/platform',
  '--target',
  process.env.GITHUB_SHA,
  '--draft',
  '--prerelease',
  '--latest=false',
  '--title',
  `Tuturuuu ${version} desktop beta`,
  '--notes-file',
  notes,
  ...files.map(({ name }) => join(directory, name)),
]);
verifyDraftRelease(readDraftRelease(tag), {
  tag,
  source: process.env.GITHUB_SHA,
  files,
});
gh([
  'release',
  'edit',
  tag,
  '--repo',
  'tutur3u/platform',
  '--draft=false',
  '--prerelease',
  '--latest=false',
]);
