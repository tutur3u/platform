import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = 'apps/meet-realtime';

export function verifyArchive(path, expected) {
  if (
    !/^[a-f0-9]{64}$/.test(expected ?? '') ||
    createHash('sha256').update(readFileSync(path)).digest('hex') !== expected
  )
    throw new Error('MEET_REALTIME_RELEASE_ARCHIVE');
}

export function emittedFiles(directory) {
  const files = {};
  const walk = (path) => {
    for (const entry of readdirSync(path).sort()) {
      const child = join(path, entry);
      const stat = lstatSync(child);
      if (stat.isSymbolicLink())
        throw new Error('MEET_REALTIME_RELEASE_SYMLINK');
      if (stat.isDirectory()) walk(child);
      else if (stat.isFile())
        files[relative(directory, child)] = createHash('sha256')
          .update(readFileSync(child))
          .digest('hex');
      else throw new Error('MEET_REALTIME_RELEASE_FILE_TYPE');
    }
  };
  walk(directory);
  return files;
}

export function validateConfig(directory) {
  const config = JSON.parse(
    readFileSync(join(directory, 'worker/wrangler.json'), 'utf8')
  );
  if (config.name !== 'tuturuuu-meet-realtime' || config.build?.command)
    throw new Error('MEET_REALTIME_RELEASE_CONFIG');
  if (typeof config.main !== 'string' || isAbsolute(config.main))
    throw new Error('MEET_REALTIME_RELEASE_ENTRY');
  const entry = resolve(directory, 'worker', config.main);
  if (!entry.startsWith(resolve(directory) + sep) || !lstatSync(entry).isFile())
    throw new Error('MEET_REALTIME_RELEASE_ENTRY');
}

export function verifyRealtime(mode, source, directory = root) {
  if (!/^[a-f0-9]{40}$/.test(source ?? ''))
    throw new Error('MEET_REALTIME_RELEASE_SOURCE');
  const dist = join(directory, 'dist');
  if (lstatSync(dist).isSymbolicLink())
    throw new Error('MEET_REALTIME_RELEASE_SYMLINK');
  validateConfig(dist);
  const files = emittedFiles(dist);
  const receipt = join(directory, 'meet-release.json');
  if (mode === 'seal') {
    writeFileSync(receipt, JSON.stringify({ source, files }));
  } else if (mode === 'verify') {
    const expected = JSON.parse(readFileSync(receipt, 'utf8'));
    if (
      expected.source !== source ||
      JSON.stringify(expected.files) !== JSON.stringify(files)
    )
      throw new Error('MEET_REALTIME_RELEASE_MISMATCH');
  } else throw new Error('MEET_REALTIME_RELEASE_MODE');
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv[2] === 'archive')
      verifyArchive(process.argv[3], process.argv[4]);
    else verifyRealtime(process.argv[2], process.argv[3]);
  } catch {
    const result = {
      guardCode: 'MEET_REALTIME_RELEASE_STOP',
      phase: 'artifact',
    };
    if (process.env.RUNNER_TEMP)
      writeFileSync(
        join(process.env.RUNNER_TEMP, 'meet-realtime-release-result.json'),
        JSON.stringify(result)
      );
    console.error(result.guardCode);
    process.exitCode = 1;
  }
}
