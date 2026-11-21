import { writeFileSync } from 'node:fs';
import { appendFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from './command.mjs';
import { readDraftRelease, verifyDraftRelease } from './draft-release.mjs';
import { changesSince, renderDesktopReleaseNotes } from './release-notes.mjs';
import {
  desktopBuildVersion,
  desktopReleaseTag,
  listDesktopReleases,
} from './release-version.mjs';
import { topUpRelease } from './release-topup.mjs';
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
// The ledger assigned this version and build to the commit; the build embedded
// both. Only this commit's own published beta may already hold the tag: a
// rerun then adds the platforms the first attempt could not publish.
const tag = desktopReleaseTag(version, process.env.DESKTOP_BUILD);
const releases = listDesktopReleases();
const existing = releases.find((release) => release.tag === tag);
if (existing && (existing.draft || existing.source !== process.env.GITHUB_SHA))
  throw new Error(
    `Desktop release ${tag} already exists; inspect existing desktop releases before rerunning`
  );
const previous = releases.find(
  (release) => !release.draft && release.tag !== tag
);
const sized = await Promise.all(
  files.map(async (file) => ({
    ...file,
    size: (await stat(join(directory, file.name))).size,
  }))
);
const notes = join(process.env.RUNNER_TEMP, 'desktop-release-notes.md');
const changes = changesSince(previous?.source, process.env.GITHUB_SHA);
// Renders the notes for exactly the packages listed, so a release never shows
// a package without its checksum and verification warnings.
// `published` carries digest and size for packages already on the release, so
// the notes always describe the bytes users actually download.
const writeNotes = (names, published = {}) => {
  writeFileSync(
    notes,
    renderDesktopReleaseNotes({
      version,
      build: process.env.DESKTOP_BUILD,
      source: process.env.GITHUB_SHA,
      run: process.env.GITHUB_RUN_ID,
      files: sized
        .filter((file) => names.includes(file.name))
        .map((file) => {
          const kept = published[file.name];
          if (!kept) return file;
          // This run verified other bytes. The kept package's signature was
          // checked only by the run that published it, so make no claim.
          return kept.sha256 === file.sha256
            ? { ...file, ...kept }
            : { ...file, ...kept, verification: 'published-unverified' };
        }),
      changes,
      previous: previous && {
        ...previous,
        // Legacy tags carry a GitHub run ID, far above any ledger build.
        legacy: Number(/-(\d+)$/u.exec(previous.tag)?.[1] ?? 0) > 2_100_000_000,
      },
    })
  );
  return notes;
};
writeNotes(sized.map((file) => file.name));
// Desktop runs are serialized, but a failed-job rerun of an older commit can
// arrive after a newer desktop build shipped. Refuse before creating anything
// and again right before anything becomes public.
const LEDGER_SUFFIX = /^desktop-v\d+\.\d+\.\d+-([1-9]\d{0,9})$/u;
function assertNoNewerDesktopBuild() {
  const build = Number(process.env.DESKTOP_BUILD);
  const newer = listDesktopReleases().find((release) => {
    const suffix = Number(LEDGER_SUFFIX.exec(release.tag)?.[1] ?? 0);
    return !release.draft && suffix <= 2_100_000_000 && suffix > build;
  });
  if (newer)
    throw new Error(
      `Desktop ${newer.tag} already shipped a newer build; this run must not publish`
    );
}
assertNoNewerDesktopBuild();
// Uploading a draft takes minutes; re-check source order right before the
// release becomes public, through the same command stub tests use.
const assertLedgerCurrent = () =>
  runCommand(
    'node',
    [
      fileURLToPath(new URL('../app-version/allocate.mjs', import.meta.url)),
      '--assert-current',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
      },
    }
  );
if (existing) {
  assertNoNewerDesktopBuild();
  assertLedgerCurrent();
  const added = topUpRelease({
    tag,
    source: process.env.GITHUB_SHA,
    files,
    directory,
    writeNotes,
  });
  console.log(
    `Desktop release ${tag}: added ${added.length ? added.join(', ') : 'no missing assets'}.`
  );
  process.exitCode = 0;
} else {
  // Publish as a draft first. No partially uploaded release appears on /download.
  // No --clobber: immutable release tags cannot silently replace an installed build.
  const gh = (args) => runCommand('gh', args, { stdio: 'inherit' });
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
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `draft_tag=${tag}\n`);
  verifyDraftRelease(readDraftRelease(tag), {
    tag,
    source: process.env.GITHUB_SHA,
    files,
  });
  assertNoNewerDesktopBuild();
  assertLedgerCurrent();
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
}
