import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { nextBuildName } from '../mobile-deployment/build-name.mjs';
import { runCommand } from './command.mjs';

// Tags are `desktop-v<X.Y.Z>-<build>`: the shared release ledger
// (scripts/app-version) assigns both, so a desktop-only rebuild of the same
// X.Y.Z gets a higher build suffix that the in-app updater orders after it.
// Legacy tags carried a `-<run-id>` suffix or none; their version still counts.
const TAG = /^desktop-v(\d+\.\d+\.\d+)(?:-\d+)?$/u;
const VERSION = /^\d+\.\d+\.\d+$/u;

export function desktopTagVersion(tag) {
  return typeof tag === 'string' ? (TAG.exec(tag)?.[1] ?? null) : null;
}

export function desktopReleaseTag(version, build) {
  if (!VERSION.test(version ?? ''))
    throw new Error('Desktop version must be major.minor.patch');
  if (build === undefined) return `desktop-v${version}`;
  if (!/^[1-9]\d{0,9}$/u.test(String(build)))
    throw new Error('Desktop build must be a positive integer');
  return `desktop-v${version}-${build}`;
}

export function nextDesktopVersion(pubspec, tags) {
  return nextBuildName(pubspec, tags.map(desktopTagVersion));
}

// Dry runs have no release history; they keep the Release Please source version.
export function desktopBuildVersion(pubspec, override) {
  if (override) {
    desktopReleaseTag(override);
    return override;
  }
  const version = pubspec.match(/^version: (\d+\.\d+\.\d+)\+/mu)?.[1];
  if (!version) throw new Error('Invalid app version');
  return version;
}

// Newest first, as the REST API lists them. Drafts are included when the token
// can see them so an unfinished publication still reserves its version.
export function listDesktopReleases(execute = runCommand) {
  const output = execute(
    'gh',
    [
      'api',
      '--paginate',
      'repos/tutur3u/platform/releases?per_page=100',
      '--jq',
      '.[] | select(.tag_name | startswith("desktop-v")) | [.tag_name, .target_commitish, (.draft | tostring)] | @tsv',
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    }
  );
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [tag, source, draft] = line.split('\t');
      return { tag, source, draft: draft === 'true' };
    })
    .filter(({ tag }) => desktopTagVersion(tag));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const pubspec = await readFile('apps/mobile/pubspec.yaml', 'utf8');
  const version = nextDesktopVersion(
    pubspec,
    listDesktopReleases().map(({ tag }) => tag)
  );
  await appendFile(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `Desktop beta version: ${version} (tag \`${desktopReleaseTag(version)}\`).\n`
  );
}
