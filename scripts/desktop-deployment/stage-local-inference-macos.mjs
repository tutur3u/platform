import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Published flutter_edge_ai_litertlm 1.8.7 script, covered by pubspec.lock.
const scriptDigest =
  '1557859aeff30babf5756441da5c80c59ddcf64c9f500a3de854f5988f71ea6b';

/** Upstream deliberately excludes macOS companion dylibs from native assets.
 * Stage them before our existing inside-out Developer ID signing/notarization.
 * No build or unverified source fallback is permitted here.
 */
export async function stageLocalInferenceMacos(
  app,
  {
    mobileRoot = resolve('apps/mobile'),
    home = homedir(),
    run = execFileSync,
  } = {}
) {
  const configuration = JSON.parse(
    await readFile(join(mobileRoot, '.dart_tool/package_config.json'), 'utf8')
  );
  const entry = configuration.packages?.find(
    (item) => item.name === 'flutter_edge_ai_litertlm'
  );
  if (!entry) throw new Error('Pinned local inference runtime is missing');
  const root = fileURLToPath(
    new URL(
      entry.rootUri,
      pathToFileURL(join(mobileRoot, '.dart_tool/package_config.json'))
    )
  );
  const script = join(root, 'tool/stage_macos_companions.sh');
  const bytes = await readFile(script);
  if (createHash('sha256').update(bytes).digest('hex') !== scriptDigest)
    throw new Error('Local inference staging script integrity mismatch');
  const cache = join(home, 'Library/Caches/flutter_gemma/native');
  const marker = JSON.parse(
    await readFile(join(cache, '.flutter_gemma_native_version'), 'utf8')
  );
  if (marker.version !== '0.17.1-a')
    throw new Error('Local inference native cache version mismatch');
  run(
    'sh',
    [script, join(app, 'Contents/Frameworks'), join(cache, 'macos_arm64')],
    {
      stdio: 'inherit',
    }
  );
}
