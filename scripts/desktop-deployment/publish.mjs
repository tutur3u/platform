/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: standalone CI-only scripts never run in Turbo or cache release inputs */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
const version = (await readFile('apps/mobile/pubspec.yaml', 'utf8')).match(
  /^version: (\d+\.\d+\.\d+)\+/m
)?.[1];
if (!version) throw new Error('Invalid release version');
const tag = `desktop-v${version}-${process.env.GITHUB_RUN_ID}`;
const notes = join(process.env.RUNNER_TEMP, 'desktop-release-notes.md');
await writeFile(
  notes,
  `Early-access desktop beta for the platforms attached to this release. These builds may not be production-ready.\n\nSource: ${process.env.GITHUB_SHA}\n\nWindows packages have timestamped Authenticode signatures. macOS packages are Developer ID signed, notarized, and stapled. All packages have GitHub build provenance.\n\n## SHA-256\n\n${files.map(({ name, sha256 }) => `- \`${name}\`: \`${sha256}\``).join('\n')}\n`
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
const uploaded = JSON.parse(
  execFileSync('gh', ['api', `repos/tutur3u/platform/releases/tags/${tag}`], {
    encoding: 'utf8',
  })
);
if (
  uploaded.draft !== true ||
  uploaded.prerelease !== true ||
  uploaded.assets?.length !== files.length ||
  files.some(
    ({ name, sha256 }) =>
      !uploaded.assets.some(
        (asset) =>
          asset.name === name &&
          asset.state === 'uploaded' &&
          asset.digest === `sha256:${sha256}`
      )
  )
) {
  throw new Error(
    'GitHub asset verification failed; the beta release remains a draft'
  );
}
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
