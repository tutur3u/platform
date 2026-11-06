/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: standalone CI-only scripts never run in Turbo or cache release inputs */
import { execFileSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { nextBuildName } from '../mobile-deployment/build-name.mjs';

// Desktop and mobile share one scheme: Release Please owns major.minor (and a
// patch floor) in apps/mobile/pubspec.yaml; CI publishes the next unused patch
// from that channel's own history. Run IDs and commits stay in release metadata.
// Legacy tags carried a `-<run-id>` suffix; their version still counts as used.
const TAG = /^desktop-v(\d+\.\d+\.\d+)(?:-\d+)?$/u;
const VERSION = /^\d+\.\d+\.\d+$/u;

export function desktopTagVersion(tag) {
  return typeof tag === 'string' ? (TAG.exec(tag)?.[1] ?? null) : null;
}

export function desktopReleaseTag(version) {
  if (!VERSION.test(version ?? ''))
    throw new Error('Desktop version must be major.minor.patch');
  return `desktop-v${version}`;
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
export function listDesktopReleases(execute = execFileSync) {
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
