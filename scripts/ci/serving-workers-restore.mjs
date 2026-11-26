// Restores an app's sealed production artifact into cf Build Output for
// serving-workers.mjs. Split out of that file to keep it reviewable.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appConfig } from './serving-workers-apps.mjs';

const SHA = /^[0-9a-f]{40}$/;
export const SCHEDULES = 'serving-schedules.json';

export function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (output.trim()) console.log(output.trim());
  return output;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/**
 * Restore and verify the sealed archive, then emit cf Build Output from its
 * own emitted config. Cron triggers stay configured on the Worker and versions
 * never change them, so they are recorded for the publish-time schedule check
 * and left out of the uploaded config.
 */
export function restore(app, sha, artifactDir, outDir, exec = run) {
  const config = appConfig(app);
  if (!SHA.test(sha ?? ''))
    throw new Error('Supply the exact 40-hex production SHA');
  const archive = path.join(artifactDir, config.archive);
  const appDir = path.resolve('apps', app);
  let emitted;
  if (config.restore === 'roadmap') {
    exec('tar', ['-xzf', archive, '-C', appDir]);
    const verifier = pathToFileURL(
      path.join(appDir, 'scripts/seal-artifact.mjs')
    );
    exec('node', [
      '--input-type=module',
      '-e',
      `import { verifySealedArtifact } from ${JSON.stringify(verifier.href)}; verifySealedArtifact(${JSON.stringify(`${appDir}/`)}, ${JSON.stringify(sha)});`,
    ]);
    emitted = readJson(
      path.join(appDir, 'roadmap-artifact.json')
    ).emittedConfig;
  } else {
    const { script, profile, env } = config.restore;
    // A private directory: a predictable shared temp path could be
    // pre-created as a symlink or rewritten to redirect configPath.
    const receiptDir = mkdtempSync(
      path.join(process.env.RUNNER_TEMP || tmpdir(), 'serving-workers-restore-')
    );
    const receipt = path.join(receiptDir, `${app}-${sha}-restored.json`);
    const flags = profile ? ['--profile', 'production'] : [];
    const options = { env: { ...process.env, ...env(sha) } };
    try {
      exec(
        'python3',
        [
          script,
          ...flags,
          'restore',
          appDir,
          '--archive',
          archive,
          '--receipt',
          receipt,
        ],
        options
      );
      exec(
        'python3',
        [script, ...flags, 'verify', appDir, '--receipt', receipt],
        options
      );
      emitted = readJson(receipt).configPath;
    } finally {
      rmSync(receiptDir, { force: true, recursive: true });
    }
  }
  if (typeof emitted !== 'string' || emitted.includes('..'))
    throw new Error('sealed receipt names no emitted config');
  let configPath = path.join(appDir, emitted);
  const emittedConfig = readJson(configPath);
  const crons = [...(emittedConfig.triggers?.crons ?? [])].sort();
  if (emittedConfig.triggers) {
    const { triggers: _triggers, ...versioned } = emittedConfig;
    configPath = path.join(path.dirname(configPath), 'serving-version.json');
    writeFileSync(configPath, `${JSON.stringify(versioned, null, 2)}\n`);
  }
  exec('node', [
    'scripts/ci/void-cf-output.mjs',
    '--config',
    configPath,
    '--out',
    outDir,
    '--sha',
    sha,
  ]);
  writeFileSync(path.join(outDir, SCHEDULES), `${JSON.stringify({ crons })}\n`);
}
