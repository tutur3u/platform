import { execFileSync } from 'node:child_process';
import normalizer from '../ci/normalize-release-notes.js';
import { DESKTOP_PLATFORMS } from './platforms.mjs';
import { desktopReleaseTag } from './release-version.mjs';

const repository = 'tutur3u/platform';
const github = `https://github.com/${repository}`;
const maxEntries = 12;
// Matches the platform names on tuturuuu.com/download.
const PLATFORM_NAMES = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
const CHECKSUM_COMMANDS = {
  windows: (name) => `Get-FileHash .\\${name} -Algorithm SHA256`,
  macos: (name) => `shasum -a 256 ${name}`,
  linux: (name) => `sha256sum ${name}`,
};

function platformOf(name) {
  const platform = Object.keys(DESKTOP_PLATFORMS).find(
    (key) => DESKTOP_PLATFORMS[key].name === name
  );
  if (!platform) throw new Error(`Unknown desktop package: ${name}`);
  return platform;
}

// Same unit and rounding as the download page.
export function formatSize(bytes) {
  return `${Math.ceil(bytes / 1024 / 1024)} MB`;
}

// Desktop ships from apps/mobile, so it uses the same commit filter and store
// normalizer as the mobile beta notes, split into Highlights and Fixes.
export function classifyChanges(subjects) {
  const features = [];
  const others = [];
  for (const subject of subjects) {
    (/^feat(?:\([^)]*\))?!?:/iu.test(subject.trim()) ? features : others).push(
      subject
    );
  }
  const normalize = (lines) =>
    normalizer
      .normalizeMobileReleaseNotes(lines.join('\n'))
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(2));
  return { highlights: normalize(features), fixes: normalize(others) };
}

// Production syncs can rewrite history, so the previous source is not always an
// ancestor. A right-only cherry-pick range skips patch-equivalent commits that
// the previous beta already shipped.
export function changesSince(previous, source, git = execFileSync) {
  if (
    ![previous, source].every(
      (value) =>
        typeof value === 'string' &&
        value.length === 40 &&
        /^[a-f0-9]{40}$/iu.test(value)
    )
  )
    return null;
  try {
    return classifyChanges(
      git(
        'git',
        [
          'log',
          '--no-merges',
          '--right-only',
          '--cherry-pick',
          '--format=%s',
          '--end-of-options',
          `${previous}...${source}`,
          '--',
          'apps/mobile',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      ).split('\n')
    );
  } catch {
    return null;
  }
}

function bullets(entries, empty, more) {
  if (!entries.length) return `- ${empty}`;
  const shown = entries.slice(0, maxEntries).map((entry) => `- ${entry}`);
  if (entries.length > maxEntries)
    shown.push(`- …and ${entries.length - maxEntries} more in ${more}.`);
  return shown.join('\n');
}

function knownIssues(files, previous) {
  const issues = [
    'This is an early-access beta, so some features may not be production-ready yet.',
  ];
  if (files.some(({ verification }) => verification === 'unsigned-windows'))
    issues.push(
      'Windows packages are UNSIGNED for now. SmartScreen may show "Windows protected your PC" or "Unknown publisher". After verifying the SHA-256 checksum below, choose More info, then Run anyway if you trust this release and Windows offers that option. Organization policy or Smart App Control may block unsigned apps; use the web app instead of disabling security protections. Unsigned beta updates require manually installing a verified package; the in-app updater requires publisher signatures.'
    );
  if (previous?.legacy)
    issues.push(
      `Desktop betas published before this one can't see it in the in-app updater. Download it once from [tuturuuu.com/download](https://tuturuuu.com/download); later updates arrive in the app as usual.`
    );
  return issues;
}

function trust({ name, verification }) {
  if (name.endsWith('.exe'))
    return verification === 'unsigned-windows'
      ? 'Windows: the installer is not code-signed yet (see Known issues).'
      : 'Windows packages have timestamped Authenticode signatures.';
  if (name.endsWith('.dmg'))
    return 'macOS packages are Developer ID signed, notarized, and stapled.';
  return 'Linux packages are unsigned Debian archives with CI installation and launch checks. Provenance signing authenticates the package bytes and build identity; it is separate from an embedded Debian publisher signature.';
}

/**
 * files: [{ name, sha256, size, verification }]
 * changes: { highlights, fixes } or null when history is unavailable.
 * previous: { tag, source, legacy } of the last published desktop beta.
 */
export function renderDesktopReleaseNotes({
  version,
  source,
  run,
  files,
  changes,
  previous,
}) {
  if (!/^[a-f0-9]{40}$/u.test(source ?? '') || !/^\d+$/u.test(run ?? ''))
    throw new Error('Invalid release identity');
  const tag = desktopReleaseTag(version);
  const ordered = Object.keys(DESKTOP_PLATFORMS)
    .map((platform) => files.find((file) => platformOf(file.name) === platform))
    .filter(Boolean);
  if (ordered.length !== files.length || !ordered.length)
    throw new Error('Release notes need one package per platform');
  const platforms = ordered.map(({ name }) => PLATFORM_NAMES[platformOf(name)]);
  const list =
    platforms.length > 1
      ? `${platforms.slice(0, -1).join(', ')}${platforms.length > 2 ? ',' : ''} and ${platforms.at(-1)}`
      : platforms[0];
  const compare = previous
    ? `${github}/compare/${previous.source}...${source}`
    : `${github}/commits/${source}`;
  const more = `the [full comparison](${compare})`;
  const unavailable =
    'Changes since the previous desktop beta are listed in the build details below.';
  const metadata = JSON.stringify({ version, tag, source, run });

  return `Tuturuuu ${version} is an early-access desktop beta for ${list}. Thanks for trying it! You can always get the latest build from [tuturuuu.com/download](https://tuturuuu.com/download).

## Highlights

${changes ? bullets(changes.highlights, 'No new features in this build.', more) : `- ${unavailable}`}

## Fixes

${changes ? bullets(changes.fixes, 'No fixes in this build.', more) : `- ${unavailable}`}

## Known issues

${knownIssues(ordered, previous)
  .map((issue) => `- ${issue}`)
  .join('\n')}

## Downloads

| Platform | File | Size | SHA-256 |
| --- | --- | --- | --- |
${ordered
  .map(
    ({ name, size, sha256 }) =>
      `| ${PLATFORM_NAMES[platformOf(name)]} | [${name}](${github}/releases/download/${tag}/${name}) | ${formatSize(size)} | \`${sha256}\` |`
  )
  .join('\n')}

## Verify your download

Compare the SHA-256 in the table with the file you downloaded:

${ordered
  .map(
    ({ name }) =>
      `- ${PLATFORM_NAMES[platformOf(name)]}: \`${CHECKSUM_COMMANDS[platformOf(name)](name)}\``
  )
  .join('\n')}

${ordered.map(trust).join(' ')} All packages have cryptographically signed GitHub build provenance verified against this workflow, production ref, and exact source SHA before publication. To check it with GitHub CLI:

\`\`\`sh
gh attestation verify <downloaded-package> --repo ${repository} --signer-workflow ${repository}/.github/workflows/desktop-beta.yaml --source-ref refs/heads/production --source-digest ${source} --deny-self-hosted-runners
\`\`\`

<details>
<summary>Build details</summary>

| Detail | Value |
| --- | --- |
| Version | \`${version}\` |
| Source commit | [\`${source.slice(0, 10)}\`](${github}/commit/${source}) |
| Workflow run | [${run}](${github}/actions/runs/${run}) |
| Previous desktop beta | ${previous ? `[\`${previous.tag}\`](${github}/releases/tag/${previous.tag}) ([changes](${compare}))` : 'None'} |

</details>

<!-- tuturuuu-desktop-release ${metadata} -->
`;
}
