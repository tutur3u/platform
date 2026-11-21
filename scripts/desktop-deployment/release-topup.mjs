import { join } from 'node:path';
import { runCommand } from './command.mjs';
import { readDraftRelease } from './draft-release.mjs';

// A rerun of a failed platform leg, or a fresh release of the same commit,
// reuses the commit's ledger tag. When an earlier attempt already published a
// verified subset, only the missing platform assets are added. Published
// assets are never replaced. A rebuild can differ byte for byte (a signed
// installer is re-timestamped), so the published asset stays authoritative and
// the notes describe it with its published digest and size.
export function planTopUp(release, { tag, source, files }) {
  if (
    release?.tag_name !== tag ||
    release?.target_commitish !== source ||
    release?.draft !== false ||
    release?.prerelease !== true ||
    !Array.isArray(release?.assets)
  )
    throw new Error(
      `Desktop release ${tag} exists but is not this commit's published beta; inspect it before rerunning`
    );
  // The refreshed notes are rendered from `files`, so they must cover every
  // published package; otherwise its checksum and warnings would vanish.
  const absent = release.assets.filter(
    (asset) =>
      asset?.state === 'uploaded' &&
      !files.some((file) => file.name === asset?.name)
  );
  if (absent.length)
    throw new Error(
      `Rerun is missing verified packages already on ${tag} (${absent.map((asset) => asset?.name).join(', ')}); rerun every platform job`
    );
  const missing = [];
  for (const file of files) {
    const asset = release.assets.find((item) => item?.name === file.name);
    // A failed upload can leave an empty `starter` asset; it is replaced.
    if (!asset || asset.state !== 'uploaded') missing.push(file);
  }
  return missing;
}

/** Published digest and size per already-uploaded package name. */
export function publishedFacts(release, files) {
  const facts = {};
  for (const file of files) {
    const asset = release.assets?.find(
      (item) => item?.name === file.name && item.state === 'uploaded'
    );
    const digest = /^sha256:([a-f0-9]{64})$/u.exec(asset?.digest ?? '')?.[1];
    if (!asset) continue;
    if (!digest || !Number.isSafeInteger(asset.size))
      throw new Error(`Published asset ${file.name} has no verifiable digest`);
    facts[file.name] = { sha256: digest, size: asset.size };
  }
  return facts;
}

export function topUpRelease(
  { tag, source, files, directory, writeNotes },
  execute = runCommand
) {
  const { release } = readDraftRelease(tag, execute);
  const missing = planTopUp(release, { tag, source, files });
  const gh = (args) => execute('gh', args, { stdio: 'inherit' });
  const editNotes = (names, current = release) =>
    gh([
      'release',
      'edit',
      tag,
      '--repo',
      'tutur3u/platform',
      '--notes-file',
      writeNotes(names, publishedFacts(current, files)),
    ]);
  const accepted = (current) => Object.keys(publishedFacts(current, files));
  // The updater rejects a release with a half-uploaded asset, so starters for
  // the attempted names are removed before uploading and after a failure.
  const clearStarters = (current) => {
    for (const asset of current.assets ?? [])
      if (
        asset?.state !== 'uploaded' &&
        missing.some((file) => file.name === asset?.name)
      )
        gh([
          'api',
          '--method',
          'DELETE',
          `repos/tutur3u/platform/releases/assets/${asset.id}`,
        ]);
  };
  if (missing.length) {
    clearStarters(release);
    // Checksums and warnings go public before the packages they describe.
    editNotes(files.map((file) => file.name));
    try {
      gh([
        'release',
        'upload',
        tag,
        '--repo',
        'tutur3u/platform',
        ...missing.map(({ name }) => join(directory, name)),
      ]);
    } catch (error) {
      // List exactly what GitHub accepted, and drop half-uploaded leftovers.
      const current = readDraftRelease(tag, execute).release;
      clearStarters(current);
      editNotes(accepted(current), current);
      throw error;
    }
  } else {
    editNotes(files.map((file) => file.name));
  }
  const { release: after } = readDraftRelease(tag, execute);
  if (planTopUp(after, { tag, source, files }).length)
    throw new Error(`Desktop release ${tag} is still missing verified assets`);
  return missing.map(({ name }) => name);
}
