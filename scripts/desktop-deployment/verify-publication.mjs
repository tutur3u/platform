import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_FILES = [
  'Tuturuuu-windows-x64-setup.exe',
  'Tuturuuu-macos-universal.dmg',
  'Tuturuuu-linux-x64.deb',
];
const RECEIPTS = {
  windows: { name: RELEASE_FILES[0], verification: 'authenticode-timestamped' },
  macos: {
    name: RELEASE_FILES[1],
    verification: 'developer-id-notarized-stapled',
  },
};

export async function verifyPublication(directory, source, run) {
  if (!/^[a-f0-9]{40}$/.test(source ?? '') || !/^\d+$/.test(run ?? ''))
    throw new Error('Invalid release identity');
  const expected = [
    ...RELEASE_FILES,
    'verified-windows.json',
    'verified-macos.json',
  ];
  const files = await readdir(directory);
  if (
    files.length !== expected.length ||
    files.some((name) => !expected.includes(name))
  ) {
    throw new Error(
      'Release assets must exactly match the approved package set'
    );
  }
  const hashes = {};
  for (const name of expected) {
    const file = join(directory, name);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size <= 0)
      throw new Error('Invalid release asset');
    hashes[name] = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
  }
  for (const [platform, requirement] of Object.entries(RECEIPTS)) {
    const receipt = JSON.parse(
      await readFile(join(directory, `verified-${platform}.json`), 'utf8')
    );
    if (
      receipt.platform !== platform ||
      receipt.source !== source ||
      receipt.run !== run ||
      receipt.name !== requirement.name ||
      receipt.verification !== requirement.verification ||
      receipt.sha256 !== hashes[requirement.name]
    ) {
      throw new Error(
        'Signing verification does not match the release package'
      );
    }
  }
  return RELEASE_FILES.map((name) => ({ name, sha256: hashes[name] }));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await verifyPublication(
      join(process.env.RUNNER_TEMP, 'desktop-artifacts'),
      process.env.GITHUB_SHA,
      process.env.GITHUB_RUN_ID
    );
    process.stdout.write('All desktop beta publication gates passed.\n');
  } catch {
    process.stderr.write(
      'Desktop publication verification failed. No public release will be created.\n'
    );
    process.exitCode = 1;
  }
}
