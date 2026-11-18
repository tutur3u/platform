import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealArtifact, verifySealedArtifact } from './seal-artifact.mjs';

export function recoveryConfig(config) {
  if (
    config.vars?.ROADMAP_REFRESH_ENABLED !== 'true' ||
    config.triggers?.crons?.length !== 1 ||
    config.triggers.crons[0] !== '17 * * * *' ||
    !config.durable_objects?.bindings?.some(
      ({ name, class_name }) =>
        name === 'ROADMAP_ACTIVITY' && class_name === 'RoadmapActivity'
    ) ||
    !config.migrations?.some(
      ({ tag, new_sqlite_classes }) =>
        tag === 'roadmap-activity-v1' &&
        new_sqlite_classes?.includes('RoadmapActivity')
    )
  ) {
    throw new Error(
      'Expected the scheduled roadmap Worker and its SQLite migration'
    );
  }
  return {
    ...config,
    vars: { ...config.vars, ROADMAP_REFRESH_ENABLED: 'false' },
    triggers: { ...config.triggers, crons: [] },
  };
}

export function prepareRecoveryArtifact(primary, source, outputParent) {
  const { manifest, contents } = verifySealedArtifact(resolve(primary), source);
  const config = recoveryConfig(
    JSON.parse(contents.get(manifest.emittedConfig).toString('utf8'))
  );
  const root = mkdtempSync(
    join(realpathSync(outputParent), 'roadmap-recovery-')
  );
  for (const [path, bytes] of contents) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(
      file,
      path === manifest.emittedConfig
        ? `${JSON.stringify(config, null, 2)}\n`
        : bytes,
      { flag: 'wx', mode: 0o600 }
    );
  }
  sealArtifact(root, source);
  return root;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [primary, source, outputParent] = process.argv.slice(2);
  if (!primary || !source || !outputParent)
    throw new Error(
      'Supply primary artifact directory, exact SHA, and output parent'
    );
  console.log(prepareRecoveryArtifact(primary, source, outputParent));
}
